# Tab Master

Browser-local STEP AP214 classifier for FSAE frame tabs. Import a multi-body STEP file, inspect and correct each body's classification and thickness, then export body and grouped stock CSVs. The source file stays on your device.

## Local run

Requires Node.js 20 or newer. Run `npm run dev` and open `http://127.0.0.1:4173/`. Import `27-BDY-CHA-Tabs.STEP` in the page.

## GitHub Pages

Create the `tab-master` repository and push this project to its `main` branch. In repository Settings → Pages, select **GitHub Actions** as the source. The included workflow deploys `dist/` to `https://sida0.github.io/tab-master/`. The site uses relative asset URLs, so the repository path works without changes.

## Detection limits

The classifier uses exact analytic STEP surfaces. It recognizes planar sheet walls, cylindrical sheet bends, and concentric cylindrical tube walls. It does not unfold sheet metal or measure quantities beyond body counts. Named weldnuts and geometry without a reliable wall pair are placed in Review. All dimensions and categories should be checked in source CAD before fabrication.
