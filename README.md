catbox-json
===========

Memory + JSON file adapter for catbox

Persists changes in a local JSON file, use only for development

Based on the [catbox-memory](https://github.com/spumko/catbox-memory) module


### Options

- `maxByteSize` - sets an upper limit on the number of bytes that can be stored in the
  cached. Once this limit is reached no additional items will be added to the cache
  until some expire. The utilized memory calculation is a rough approximation and must
  not be relied on. Defaults to `104857600` (100MB).

- `saveDebounce` - maximum write interval. Defaults to `500` (0.5s)

- `cacheFile` - filename where JSON is written. Defaults to `./catbox.json`
