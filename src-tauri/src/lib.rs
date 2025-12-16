use std::sync::Mutex;
use std::path::PathBuf;
use std::fs;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use yrs::{Doc, Map, Array, Transact, ReadTxn, StateVector, Update, WriteTxn};
use yrs::updates::decoder::Decode;
use yrs::updates::encoder::Encode;
use yrs::types::ToJson;
use serde_json::Value as JsonValue;
use chrono::Utc;
use std::sync::Arc;
use tokio::process::Command;
use std::process::Stdio;
use pulldown_cmark::{Parser, Event, Tag, TagEnd, HeadingLevel};

// ═══════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════

/// Get the path to the data file
fn get_data_path() -> PathBuf {
    // Use ~/.float-liner/data.yjs for now (simple, visible)
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let data_dir = home.join(".float-liner");
    fs::create_dir_all(&data_dir).ok();
    data_dir.join("data.yjs")
}

/// Try to load Y.Doc from file
fn load_doc_from_file() -> Option<Doc> {
    let path = get_data_path();
    if !path.exists() {
        return None;
    }

    let bytes = fs::read(&path).ok()?;
    let doc = Doc::new();
    let update = Update::decode_v1(&bytes).ok()?;
    {
        let mut txn = doc.transact_mut();
        txn.apply_update(update);
    }

    // Verify it has the expected structure
    {
        let txn = doc.transact();
        if txn.get_map("blocks").is_none() || txn.get_array("rootIds").is_none() {
            return None;
        }
    }

    Some(doc)
}

// ═══════════════════════════════════════════════════════════════
// APP STATE
// ═══════════════════════════════════════════════════════════════

pub struct AppState {
    doc: Mutex<Doc>,
}

impl Default for AppState {
    fn default() -> Self {
        // Try to load from file first
        if let Some(doc) = load_doc_from_file() {
            println!("📂 Loaded document from {:?}", get_data_path());
            return Self { doc: Mutex::new(doc) };
        }

        println!("📝 Creating new document");
        let doc = Doc::new();

        // Initialize with Y.Doc schema:
        // - blocks: Y.Map<blockId, blockData>
        // - rootIds: Y.Array<blockId>
        {
            let mut txn = doc.transact_mut();

            // Create blocks map
            let blocks = txn.get_or_insert_map("blocks");

            // Create root block
            let root_id = "root";
            let now = Utc::now().timestamp_millis();

            let root_block = yrs::Any::Map(Arc::new([
                ("id".into(), yrs::Any::String(root_id.into())),
                ("parentId".into(), yrs::Any::Null),
                ("childIds".into(), yrs::Any::Array(Arc::from([
                    yrs::Any::String("block-1".into()),
                    yrs::Any::String("block-2".into()),
                    yrs::Any::String("block-3".into()),
                ]))),
                ("content".into(), yrs::Any::String("Root".into())),
                ("type".into(), yrs::Any::String("text".into())),
                ("collapsed".into(), yrs::Any::Bool(false)),
                ("createdAt".into(), yrs::Any::BigInt(now)),
                ("updatedAt".into(), yrs::Any::BigInt(now)),
            ].into_iter().collect()));
            blocks.insert(&mut txn, root_id, root_block);

            // Create child blocks
            for (i, content) in ["Block 1: Hello from Y.Doc", "Block 2: Edit me", "Block 3: CRDT magic"].iter().enumerate() {
                let block_id = format!("block-{}", i + 1);
                let block = yrs::Any::Map(Arc::new([
                    ("id".into(), yrs::Any::String(block_id.clone().into())),
                    ("parentId".into(), yrs::Any::String(root_id.into())),
                    ("childIds".into(), yrs::Any::Array(Arc::from([]))),
                    ("content".into(), yrs::Any::String((*content).into())),
                    ("type".into(), yrs::Any::String("text".into())),
                    ("collapsed".into(), yrs::Any::Bool(false)),
                    ("createdAt".into(), yrs::Any::BigInt(now)),
                    ("updatedAt".into(), yrs::Any::BigInt(now)),
                ].into_iter().collect()));
                blocks.insert(&mut txn, block_id.as_str(), block);
            }

            // Create rootIds array
            let root_ids = txn.get_or_insert_array("rootIds");
            root_ids.push_back(&mut txn, yrs::Any::String("root".into()));
        }

        Self {
            doc: Mutex::new(doc),
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// TAURI COMMANDS
// ═══════════════════════════════════════════════════════════════

/// Get initial Y.Doc state as base64
#[tauri::command]
fn get_initial_state(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let doc = state.doc.lock().map_err(|e| e.to_string())?;
    let txn = doc.transact();
    let update = txn.encode_state_as_update_v1(&StateVector::default());
    Ok(BASE64.encode(&update))
}

/// Apply update from frontend, return new state
#[tauri::command]
fn apply_update(state: tauri::State<'_, AppState>, update_b64: String) -> Result<String, String> {
    let update_bytes = BASE64.decode(&update_b64).map_err(|e| e.to_string())?;
    let doc = state.doc.lock().map_err(|e| e.to_string())?;

    let update = Update::decode_v1(&update_bytes).map_err(|e| e.to_string())?;
    let mut txn = doc.transact_mut();
    txn.apply_update(update);
    drop(txn);

    // Return the new full state
    let txn = doc.transact();
    let new_state = txn.encode_state_as_update_v1(&StateVector::default());
    Ok(BASE64.encode(&new_state))
}

/// Get current state as JSON (for debugging)
#[tauri::command]
fn get_state_json(state: tauri::State<'_, AppState>) -> Result<JsonValue, String> {
    let doc = state.doc.lock().map_err(|e| e.to_string())?;
    let txn = doc.transact();

    let blocks = txn.get_map("blocks").ok_or("No blocks map")?;
    let root_ids = txn.get_array("rootIds").ok_or("No rootIds array")?;

    Ok(serde_json::json!({
        "blocks": blocks.to_json(&txn),
        "rootIds": root_ids.to_json(&txn),
    }))
}

/// Get state vector for incremental sync
#[tauri::command]
fn get_state_vector(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let doc = state.doc.lock().map_err(|e| e.to_string())?;
    let txn = doc.transact();
    let sv = txn.state_vector().encode_v1();
    Ok(BASE64.encode(&sv))
}

/// Get diff from a state vector
#[tauri::command]
fn get_diff(state: tauri::State<'_, AppState>, state_vector_b64: String) -> Result<String, String> {
    let sv_bytes = BASE64.decode(&state_vector_b64).map_err(|e| e.to_string())?;
    let sv = StateVector::decode_v1(&sv_bytes).map_err(|e| e.to_string())?;

    let doc = state.doc.lock().map_err(|e| e.to_string())?;
    let txn = doc.transact();
    let diff = txn.encode_state_as_update_v1(&sv);
    Ok(BASE64.encode(&diff))
}

/// Save Y.Doc state to file
#[tauri::command]
fn save_doc(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let doc = state.doc.lock().map_err(|e| e.to_string())?;
    let txn = doc.transact();
    let update = txn.encode_state_as_update_v1(&StateVector::default());

    let path = get_data_path();
    fs::write(&path, &update).map_err(|e| format!("Failed to save: {}", e))?;

    Ok(format!("Saved to {:?}", path))
}

// ═══════════════════════════════════════════════════════════════
// MARKDOWN TREE PARSER
// ═══════════════════════════════════════════════════════════════

/// A parsed block with potential children (for heading hierarchy)
#[derive(Debug, Clone)]
struct ParsedBlock {
    id: String,
    content: String,
    block_type: String,
    children: Vec<ParsedBlock>,
}

/// Clean up tacky emojis with tasteful alternatives
fn detackify(content: &str) -> String {
    content
        .replace("✅", "◆")
        .replace("☑️", "◆")
        .replace("✔️", "◆")
        .replace("❌", "◇")
        .replace("❎", "◇")
        .replace("⛔", "◇")
        .replace("🚫", "◇")
        .replace("⚠️", "△")
        .replace("🔴", "●")
        .replace("🟢", "●")
        .replace("🟡", "●")
        .replace("📝", "»")
        .replace("📌", "»")
        .replace("💡", "◊")
        .replace("🎯", "›")
        .replace("🚀", "→")
}

/// Convert heading level to numeric depth (H1=1, H2=2, etc.)
fn heading_level_to_depth(level: HeadingLevel) -> usize {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

/// Parse markdown content into a tree of blocks based on heading hierarchy
/// Returns a flat list if no headings found, or nested structure if headings present
fn parse_markdown_tree(content: &str, base_id: &str, block_type: &str) -> Vec<ParsedBlock> {
    let parser = Parser::new(content);

    // First, check if there are any headings
    let has_headings = Parser::new(content).any(|event| {
        matches!(event, Event::Start(Tag::Heading { .. }))
    });

    // If no headings, just return flat blocks per line (original behavior)
    if !has_headings {
        return content
            .lines()
            .enumerate()
            .filter(|(_, line)| !line.trim().is_empty())
            .map(|(i, line)| ParsedBlock {
                id: format!("{}-{}", base_id, i),
                content: line.to_string(),
                block_type: block_type.to_string(),
                children: vec![],
            })
            .collect();
    }

    // Parse with heading hierarchy
    let mut root_blocks: Vec<ParsedBlock> = vec![];

    // Stack: (heading_level, block_index_in_parent_children)
    // Level 0 = root (no heading), Level 1 = H1, etc.
    let mut heading_stack: Vec<(usize, usize)> = vec![(0, 0)]; // Start at root level

    let mut current_text = String::new();
    let mut in_heading = false;
    let mut current_heading_level = 0usize;
    let mut block_counter = 0usize;

    // Helper to get mutable ref to block at path
    fn get_parent_children<'a>(blocks: &'a mut Vec<ParsedBlock>, stack: &[(usize, usize)]) -> &'a mut Vec<ParsedBlock> {
        if stack.len() <= 1 {
            return blocks;
        }

        let mut current = blocks;
        for (_, idx) in stack.iter().skip(1) {
            if *idx < current.len() {
                current = &mut current[*idx].children;
            }
        }
        current
    }

    for event in parser {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                // Flush any pending text first
                if !current_text.trim().is_empty() && !in_heading {
                    let parent = get_parent_children(&mut root_blocks, &heading_stack);
                    parent.push(ParsedBlock {
                        id: format!("{}-{}", base_id, block_counter),
                        content: current_text.trim().to_string(),
                        block_type: block_type.to_string(),
                        children: vec![],
                    });
                    block_counter += 1;
                }
                current_text.clear();

                in_heading = true;
                current_heading_level = heading_level_to_depth(level);

                // Pop stack to find correct parent level
                while heading_stack.len() > 1 && heading_stack.last().map(|(l, _)| *l).unwrap_or(0) >= current_heading_level {
                    heading_stack.pop();
                }
            }
            Event::End(TagEnd::Heading(_)) => {
                in_heading = false;

                // Create the heading block - preserve # prefix for editor styling
                let heading_prefix = "#".repeat(current_heading_level);
                let parent = get_parent_children(&mut root_blocks, &heading_stack);
                let new_idx = parent.len();
                parent.push(ParsedBlock {
                    id: format!("{}-{}", base_id, block_counter),
                    content: format!("{} {}", heading_prefix, current_text.trim()),
                    block_type: block_type.to_string(),
                    children: vec![],
                });
                block_counter += 1;

                // Push this heading onto stack as new parent
                heading_stack.push((current_heading_level, new_idx));
                current_text.clear();
            }
            Event::Text(text) | Event::Code(text) => {
                current_text.push_str(&text);
            }
            Event::SoftBreak | Event::HardBreak => {
                if !in_heading && !current_text.trim().is_empty() {
                    let parent = get_parent_children(&mut root_blocks, &heading_stack);
                    parent.push(ParsedBlock {
                        id: format!("{}-{}", base_id, block_counter),
                        content: current_text.trim().to_string(),
                        block_type: block_type.to_string(),
                        children: vec![],
                    });
                    block_counter += 1;
                    current_text.clear();
                }
            }
            Event::End(TagEnd::Paragraph) => {
                if !in_heading && !current_text.trim().is_empty() {
                    let parent = get_parent_children(&mut root_blocks, &heading_stack);
                    parent.push(ParsedBlock {
                        id: format!("{}-{}", base_id, block_counter),
                        content: current_text.trim().to_string(),
                        block_type: block_type.to_string(),
                        children: vec![],
                    });
                    block_counter += 1;
                    current_text.clear();
                }
            }
            Event::End(TagEnd::Item) => {
                if !current_text.trim().is_empty() {
                    let parent = get_parent_children(&mut root_blocks, &heading_stack);
                    parent.push(ParsedBlock {
                        id: format!("{}-{}", base_id, block_counter),
                        content: current_text.trim().to_string(), // No bullet - block dot is enough
                        block_type: block_type.to_string(),
                        children: vec![],
                    });
                    block_counter += 1;
                    current_text.clear();
                }
            }
            Event::End(TagEnd::CodeBlock) => {
                if !current_text.trim().is_empty() {
                    let parent = get_parent_children(&mut root_blocks, &heading_stack);
                    parent.push(ParsedBlock {
                        id: format!("{}-{}", base_id, block_counter),
                        content: format!("```\n{}\n```", current_text.trim()),
                        block_type: block_type.to_string(),
                        children: vec![],
                    });
                    block_counter += 1;
                    current_text.clear();
                }
            }
            _ => {}
        }
    }

    // Flush any remaining text
    if !current_text.trim().is_empty() {
        let parent = get_parent_children(&mut root_blocks, &heading_stack);
        parent.push(ParsedBlock {
            id: format!("{}-{}", base_id, block_counter),
            content: current_text.trim().to_string(),
            block_type: block_type.to_string(),
            children: vec![],
        });
    }

    root_blocks
}

/// Recursively insert parsed blocks into Y.Doc
fn insert_parsed_blocks(
    blocks: &yrs::MapRef,
    txn: &mut yrs::TransactionMut,
    parsed: &[ParsedBlock],
    parent_id: &str,
    now: i64,
) -> Vec<String> {
    let mut child_ids = vec![];

    for block in parsed {
        // Recursively insert children first to get their IDs
        let grandchild_ids = insert_parsed_blocks(blocks, txn, &block.children, &block.id, now);

        let block_data = yrs::Any::Map(Arc::new([
            ("id".into(), yrs::Any::String(block.id.clone().into())),
            ("parentId".into(), yrs::Any::String(parent_id.into())),
            ("childIds".into(), yrs::Any::Array(Arc::from(
                grandchild_ids.iter()
                    .map(|s| yrs::Any::String(s.clone().into()))
                    .collect::<Vec<_>>()
            ))),
            ("content".into(), yrs::Any::String(detackify(&block.content).into())),
            ("type".into(), yrs::Any::String(block.block_type.clone().into())),
            ("collapsed".into(), yrs::Any::Bool(false)), // Don't auto-collapse - let user see content first
            ("createdAt".into(), yrs::Any::BigInt(now)),
            ("updatedAt".into(), yrs::Any::BigInt(now)),
        ].into_iter().collect()));

        blocks.insert(txn, block.id.as_str(), block_data);
        child_ids.push(block.id.clone());
    }

    child_ids
}

// ═══════════════════════════════════════════════════════════════
// SH:: EXECUTOR
// ═══════════════════════════════════════════════════════════════

/// Execute shell command and append output as child blocks
/// Returns the updated Y.Doc state as base64
#[tauri::command]
async fn execute_shell(
    state: tauri::State<'_, AppState>,
    block_id: String,
    command: String,
) -> Result<String, String> {
    // Run the shell command
    let output = Command::new("sh")
        .arg("-c")
        .arg(&command)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let exit_code = output.status.code().unwrap_or(-1);

    // Get the doc and update
    let doc = state.doc.lock().map_err(|e| e.to_string())?;
    let mut txn = doc.transact_mut();
    let blocks = txn.get_or_insert_map("blocks");
    let now = Utc::now().timestamp_millis();

    // Get existing childIds from parent block
    let parent_block = blocks.get(&txn, &block_id)
        .ok_or_else(|| format!("Block {} not found", block_id))?;

    let existing_child_ids: Vec<String> = if let yrs::Value::YMap(map) = parent_block {
        if let Some(yrs::Value::Any(yrs::Any::Array(arr))) = map.get(&txn, "childIds") {
            arr.iter()
                .filter_map(|a| if let yrs::Any::String(s) = a { Some(s.to_string()) } else { None })
                .collect()
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    let mut new_child_ids = existing_child_ids.clone();

    // Parse stdout with smart markdown indentation (headings become parents)
    if !stdout.trim().is_empty() {
        let parsed_stdout = parse_markdown_tree(&stdout, &format!("{}-out", block_id), "output");
        let stdout_ids = insert_parsed_blocks(&blocks, &mut txn, &parsed_stdout, &block_id, now);
        new_child_ids.extend(stdout_ids);
    }

    // Parse stderr (typically not markdown, but still use the parser for consistency)
    if !stderr.trim().is_empty() {
        let parsed_stderr = parse_markdown_tree(&stderr, &format!("{}-err", block_id), "error");
        let stderr_ids = insert_parsed_blocks(&blocks, &mut txn, &parsed_stderr, &block_id, now);
        new_child_ids.extend(stderr_ids);
    }

    // Update parent block with new childIds and status
    let status = if exit_code == 0 { "complete" } else { "error" };
    let updated_parent = yrs::Any::Map(Arc::new([
        ("id".into(), yrs::Any::String(block_id.clone().into())),
        ("parentId".into(), yrs::Any::String("root".into())), // Assume root for now
        ("childIds".into(), yrs::Any::Array(Arc::from(
            new_child_ids.iter()
                .map(|s| yrs::Any::String(s.clone().into()))
                .collect::<Vec<_>>()
        ))),
        ("content".into(), yrs::Any::String(format!("sh:: {}", command).into())),
        ("type".into(), yrs::Any::String("sh".into())),
        ("status".into(), yrs::Any::String(status.into())),
        ("exitCode".into(), yrs::Any::BigInt(exit_code as i64)),
        ("collapsed".into(), yrs::Any::Bool(false)),
        ("createdAt".into(), yrs::Any::BigInt(now)),
        ("updatedAt".into(), yrs::Any::BigInt(now)),
    ].into_iter().collect()));

    blocks.insert(&mut txn, block_id.as_str(), updated_parent);

    drop(txn);

    // Return updated state
    let txn = doc.transact();
    let new_state = txn.encode_state_as_update_v1(&StateVector::default());
    Ok(BASE64.encode(&new_state))
}

// ═══════════════════════════════════════════════════════════════
// TAURI APP
// ═══════════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_initial_state,
            apply_update,
            get_state_json,
            get_state_vector,
            get_diff,
            save_doc,
            execute_shell,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
