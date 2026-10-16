import { describe, expect, it } from "vitest"
import { matchCategoriesByName } from "./category-match"

const categories = [
  { id: 3, name: "Wisata Kuliner", slug: "wisata-kuliner" },
  { id: 4, name: "Tips &amp; Trik", slug: "tips-trik" },
  { id: 5, name: "Kopi", slug: "kopi" },
  { id: 6, name: "Kafé Lokal", slug: "kafe-lokal" },
]

describe("matchCategoriesByName", () => {
  it("nama tanpa membedakan huruf besar/kecil & spasi berlebih; entitas HTML WordPress di-decode", () => {
    expect(matchCategoriesByName(categories, ["  wisata   KULINER "]).matched.map((c) => c.id)).toEqual([3])
    expect(matchCategoriesByName(categories, ["tips & trik"]).matched.map((c) => c.id)).toEqual([4])
  })

  it("slug: ditulis langsung sebagai slug atau nama yang di-slug-kan (diakritik dibuang)", () => {
    expect(matchCategoriesByName(categories, ["WISATA-KULINER"]).matched.map((c) => c.id)).toEqual([3])
    expect(matchCategoriesByName(categories, ["Kafe Lokal"]).matched.map((c) => c.id)).toEqual([6])
  })

  it("nama tidak ada → unmatched (tidak pernah dibuat); nama ganda & kosong diabaikan", () => {
    expect(matchCategoriesByName(categories, ["Teh", "teh", "", "Kopi", "KOPI"])).toEqual({
      matched: [categories[2]],
      unmatched: ["Teh"],
    })
  })

  it("nama permintaan berisi markup diperlakukan sebagai teks polos (tidak mencocokkan apa pun secara tak sengaja)", () => {
    expect(matchCategoriesByName(categories, ["<b>Kopi</b>"]).matched.map((c) => c.id)).toEqual([5])
    expect(matchCategoriesByName(categories, ["<script>x</script>"])).toEqual({ matched: [], unmatched: [] })
  })
})
