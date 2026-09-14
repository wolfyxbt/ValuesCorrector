# Emoji catalog

Derived from emojibase-data 17.0.0 (Emoji/Unicode 17), Chinese and English compact datasets.
Source: https://github.com/milesj/emojibase
Documentation: https://emojibase.dev/docs/datasets/
License: MIT; see LICENSE.

catalog.json contains categorized emoji and skin-tone sequences, ordered by the source's Unicode order. Each entry is [unicode, Chinese label, group, English label and search keywords]. Unclassified standalone regional indicators are omitted because they are flag components, not complete flags.
The picker loads this local file only when opened. Images and remote APIs are not used.
