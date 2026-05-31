# External Reference And Website License Policy

Design Director may link to external websites, design systems, documentation, and asset sources. Those references are not bundled content. Treat each reference as a design or implementation signal unless a license explicitly permits redistribution.

## Safe To Link, Not Safe To Copy Wholesale

These sources may be cited as references, but their text, screenshots, layouts, brand systems, assets, and site code should not be copied into this repository:

- Practical Typography
- Design Spells
- 60fps.design
- UXSnaps
- Awwwards
- Bento Grids
- Detail
- Craftwork curated websites
- UI Playbook
- Live product sites such as Linear, Vercel, Stripe, Raycast, Notion, Supabase, and similar product references

For these references, record the role, principle extracted, and `do_not_copy` boundary in the design brief. A result that could be mistaken for the reference fails the Design Director review.

## OSS Component And Visualization References

The following implementation references had permissive package metadata when checked on 2026-05-31. They may be used as dependencies or code references under their own license terms, but their documentation and website content should still be cited, not copied wholesale.

- Component systems: Carbon `Apache-2.0`, Cloudscape `Apache-2.0`, Primer `MIT`, PatternFly `MIT`, Fluent UI `MIT`, MUI `MIT`, Ant Design `MIT`, Radix UI `MIT`, React Aria `Apache-2.0`, shadcn/ui `MIT`.
- Visualization libraries: D3 `ISC`, Observable Plot `ISC`, Vega-Lite `BSD-3-Clause`, ECharts `Apache-2.0`, Recharts `MIT`, visx `MIT`, MapLibre GL JS `BSD-3-Clause`, Leaflet `BSD-2-Clause`, OpenLayers `BSD-2-Clause`, deck.gl `MIT`, React Flow `MIT`, Cytoscape.js `MIT`, Mermaid `MIT`.
- Icons: Better Icons is `MIT`, Iconify JSON is `MIT`, Lucide React is `ISC`. Individual icon sets retrieved through Iconify may carry their own licenses, so record the exact icon set before vendoring SVGs.

## Caution Or Do Not Vendor By Default

- Grafana: read-only operational inspiration by default because AGPL reuse can affect redistribution obligations.
- D2: npm metadata reports `MPL-2.0`; use as a tool/reference, but avoid copying source into this repository unless MPL obligations are explicitly handled.
- GSAP: npm metadata points to the GSAP Standard License, not a standard OSS license. Use under GSAP terms when needed; do not vendor GSAP source into this repository by default.
- Mapbox GL JS: not the default map choice unless the project accepts Mapbox terms.
- Craftwork assets/templates, Resource Boy assets, paid UI kits, and paid icon packs: do not bundle unless the exact purchased/free license is recorded.
- Font files: Google Fonts, Fontshare, and other font sources require per-font license records before bundling font files. Linking to hosted CSS is different from redistributing font binaries.
- Stock/photo/video sources such as Unsplash, Pexels, Picsum, Mixkit, and Coverr are asset sources, not design-system licenses. Do not redistribute downloaded assets inside this repo unless the asset license allows it and attribution/terms are recorded.

## Packaging Rule

Bundled content must have an explicit license file or package metadata. If a website only provides inspiration, a gallery, screenshots, examples, or documentation with no redistribution license, keep it as a link and principle extraction only.
