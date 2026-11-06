# Tab Master

Browser-local STEP AP214 classifier for FSAE frame tabs. Import a multi-body STEP file, inspect and correct each body's classification and thickness, view each solid alone or in its original assembly position, then export body and grouped stock CSVs, a ZIP of independent STEP solids, or a ZIP of 2D flat-face DXFs sorted by form and stock thickness. The source file stays on your device.

The Tutorial page includes one bent seat-pan tab from the example STEP and an interactive 3D preview. The workspace can load that example directly, so the import, review, and export flow can be tried without another file.

## Local run

Requires Node.js 20 or newer. Run `npm run dev` and open `http://127.0.0.1:4173/`. Import `27-BDY-CHA-Tabs.STEP` in the page. The 3D view can take several seconds to build after import.

## GitHub Pages

Create the `tab-master` repository and push this project to its `main` branch. In repository Settings → Pages, select **GitHub Actions** as the source. The included workflow deploys `dist/` to `https://sida0.github.io/tab-master/`. The site uses relative asset URLs, so the repository path works without changes.

## Detection limits

The classifier uses exact analytic STEP surfaces. It recognizes planar sheet walls, cylindrical sheet bends, and concentric cylindrical tube walls. It does not unfold sheet metal or measure quantities beyond body counts. Named weldnuts and geometry without a reliable wall pair are placed in Review. All dimensions and categories should be checked in source CAD before fabrication.

The ZIP has one analytic STEP solid per file, grouped under `Flat-Sheet`, `Bent-Sheet-Metal`, `Tube`, or `Needs-Review`, then by stock or wall thickness. Body coordinates match the source assembly. The 3D preview is a triangulated display of those solids; it does not change the STEP geometry. Third-party CAD, ZIP, and viewer libraries and their licenses are included in `dist/vendor/`.

The separate flat-face ZIP contains a 2D DXF of the largest closed planar face for each eligible body. The contours are in inches and include holes and the coped edge; circles and spline edges are traced to approximately 0.0005 in. Flat sheet bodies are grouped by stock thickness. Bent sheet and uncertain bodies are placed under `Review-Required` because one face is not an unfolded blank and uncertain geometry may not be a tab. Tube bodies are listed in `not-exported.csv` because their cross section is not a flat blank. `face-index.csv` records each generated DXF and face size. Inspect each preview and compare it with the source CAD before ordering cuts.
