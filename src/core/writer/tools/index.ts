import { ToolRegistry } from "./registry"
import { webSearchToolDef } from "./definitions/web-search"
import { webReaderToolDef } from "./definitions/web-reader"
import { imageSearchToolDef } from "./definitions/image-search"
import { uploadMediaToolDef } from "./definitions/upload-media"
import { keywordSuggestionsToolDef } from "./definitions/keyword-suggestions"
import { setFeaturedImageToolDef } from "./definitions/set-featured-image"

// Daftarkan seluruh tool baku sistem
ToolRegistry.register(webSearchToolDef)
ToolRegistry.register(webReaderToolDef)
ToolRegistry.register(imageSearchToolDef)
ToolRegistry.register(setFeaturedImageToolDef)
ToolRegistry.register(uploadMediaToolDef)
ToolRegistry.register(keywordSuggestionsToolDef)

export * from "./registry"
export * from "./eligibility"
export * from "./definitions/web-search"
export * from "./definitions/web-reader"
export * from "./definitions/image-search"
export * from "./definitions/upload-media"
export * from "./definitions/keyword-suggestions"
export * from "./definitions/set-featured-image"
