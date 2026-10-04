import { ToolRegistry } from "./registry"
import { webSearchToolDef } from "./definitions/web-search"
import { webReaderToolDef } from "./definitions/web-reader"
import { imageSearchToolDef } from "./definitions/image-search"
import { uploadMediaToolDef } from "./definitions/upload-media"
import { listCategoriesToolDef } from "./definitions/list-categories"
import { listTagsToolDef } from "./definitions/list-tags"
import { listAuthorsToolDef } from "./definitions/list-authors"
import { keywordSuggestionsToolDef } from "./definitions/keyword-suggestions"

// Daftarkan seluruh tool baku sistem
ToolRegistry.register(webSearchToolDef)
ToolRegistry.register(webReaderToolDef)
ToolRegistry.register(imageSearchToolDef)
ToolRegistry.register(uploadMediaToolDef)
ToolRegistry.register(listCategoriesToolDef)
ToolRegistry.register(listTagsToolDef)
ToolRegistry.register(listAuthorsToolDef)
ToolRegistry.register(keywordSuggestionsToolDef)

export * from "./registry"
export * from "./eligibility"
export * from "./definitions/web-search"
export * from "./definitions/web-reader"
export * from "./definitions/image-search"
export * from "./definitions/upload-media"
export * from "./definitions/list-categories"
export * from "./definitions/list-tags"
export * from "./definitions/list-authors"
export * from "./definitions/keyword-suggestions"
