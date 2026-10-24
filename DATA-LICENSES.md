# Data licences

The **code** in this repository is MIT (see `package.json`). The **data files** are not
ours to relicense — each carries the terms of the source it was built from, and this
file records which. `#/explore/sources` in the app shows the same thing at a glance,
generated from `scripts/lib/provenance.mjs`.

Everything here is openly licensed. Most of it asks only for credit. One asks for more,
and is called out below.

| Data | Source | Licence |
|---|---|---|
| `data/datasets.json` | World Bank Open Data | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `data/electricity.json` | Ember, via Our World in Data | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `data/attributes.json`, `data/relations.json` | CIA World Factbook | Public domain |
| `data/heritage.json` | UNESCO World Heritage Centre | [**CC BY-SA 4.0**](https://creativecommons.org/licenses/by-sa/4.0/) |
| `data/emblems.json` | Wikidata | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `data/shapes/` | geoBoundaries | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `data/countries-*.json`, `data/entities.json` | Natural Earth | Public domain |

Images are hotlinked rather than stored: flags from [flagcdn](https://flagcdn.com)
(Flagpedia states flag images are public domain and free for commercial use), and coats
of arms and World Heritage photographs from
[Wikimedia Commons](https://commons.wikimedia.org), which hosts no non-free media and
carries per-file terms.

## The one with a condition beyond credit

**`data/heritage.json` is derived from the UNESCO World Heritage List, which is CC BY-SA
4.0.** Share-alike travels with an adaptation, so that file — not the repository's code —
is offered under CC BY-SA 4.0. Reuse it on those terms. The MIT licence covers the code
only.

[mledoze/countries](https://github.com/mledoze/countries) (ODbL 1.0) is used at build
time, as the ISO2 → ISO3 lookup in `scripts/build-shapes.mjs`. None of that database is
redistributed here, so its share-alike clause does not reach these files. It is listed in
the app's sources view for completeness.

## Keeping this true

Licences are declared once, in `scripts/lib/provenance.mjs`, which the build scripts also
fetch from. `npm run build:sources` regenerates `data/sources.json`, and refuses to write
if any source is missing a licence. When a source is added or changed, change it there and
re-run — then update the table above.
