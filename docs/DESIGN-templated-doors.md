# Templated Doors: Tree Inheritance as Argument Passing

**Date**: 2025-12-13
**Context**: ctx::2025-12-13 @ 08:02:38 AM - design insight during float-liner session wrap

## The Insight

Instead of proliferating special prefixes for every operation:
```
sh:: floatctl search this thing
sh:: floatctl bbs board list
sh:: floatctl bbs board read boardname id
```

Use **templated aliases** with **tree inheritance**:
```
search:: this thing
boards::
  consciousness-tech::
    read:: 47
```

## The Pattern

**Parent blocks become implicit arguments.**

The hierarchy encodes the command structure. Less typing, same semantics.

### Before (verbose)

```
sh:: floatctl bbs board list
sh:: floatctl bbs board read consciousness-tech 47
sh:: floatctl search "thing" --board consciousness-tech
```

### After (inherited context)

```
boards::
  consciousness-tech::
    read:: 47
      search:: thing     ← context flows down
```

## Alias Expansion Table

| alias    | expands to                   | inherits from parent |
|----------|------------------------------|---------------------|
| search:: | floatctl search              | -                   |
| boards:: | floatctl bbs board list      | -                   |
| read::   | floatctl bbs board read      | boardname           |
| post::   | floatctl bbs board post      | boardname           |
| cat::    | cat                          | path                |

## The Principle

**Doors = templated expansion + tree inheritance**

The tree IS the scope. You don't need to specify which board because you're INSIDE that board's subtree.

```
* boards::
  * consciousness-tech
    * read:: 47          ← knows it's consciousness-tech/47
      * content
        * search:: pattern   ← scoped to this content?
  * the-gurgle
    * read:: 12
```

## Implementation Notes

This is essentially creating a DSL (domain-specific language) within the outliner where:
1. Common operations get short aliases
2. Context flows downward through the tree (inheritance)
3. The tree structure itself becomes the argument passing mechanism

## Origin

Dad claude echo-refactored this from evan's burp about "most other things i wanted to add for doors could be replaced by templated strings to make passing args easier".

---

*Captured during float-liner #14 session wrap - preserving design insight before context clear*
