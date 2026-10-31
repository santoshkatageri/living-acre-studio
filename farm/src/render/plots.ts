import * as THREE from "three";

import { cropById } from "../sim/crops";
import { cellCentre, type PlotGrid } from "../sim/plot";

/*  The 5 x 5 bed: soil tiles, crop bodies scaled by stage, and the two
    highlights (where the farmer faces, and where the cursor is). */

export interface PlotView {
  group: THREE.Group;
  sync(grid: PlotGrid): void;
  setHighlights(active: number | null, hover: number | null): void;
  dispose(): void;
}

export function createPlotView(grid: PlotGrid, baseY: number): PlotView {
  const group = new THREE.Group();
  group.name = "plot";

  const soilGeometry = new THREE.BoxGeometry(grid.cellFt * 0.92, 0.12, grid.cellFt * 0.92);
  const soilMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color("#4a3524"), roughness: 1 });
  const soil = new THREE.InstancedMesh(soilGeometry, soilMaterial, grid.cells.length);
  soil.name = "plot:soil";
  group.add(soil);

  const cropGeometry = new THREE.ConeGeometry(grid.cellFt * 0.3, 1, 7);
  const cropMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color("#7c9a5d"), roughness: 1 });
  const crops = new THREE.InstancedMesh(cropGeometry, cropMaterial, grid.cells.length);
  crops.name = "plot:crops";
  crops.count = 0;
  group.add(crops);

  const highlight = new THREE.Mesh(
    new THREE.BoxGeometry(grid.cellFt * 0.98, 0.04, grid.cellFt * 0.98),
    new THREE.MeshBasicMaterial({ color: 0xe8a33d, transparent: true, opacity: 0.35 }),
  );
  highlight.visible = false;
  highlight.name = "plot:active";
  group.add(highlight);

  const hover = new THREE.Mesh(
    new THREE.BoxGeometry(grid.cellFt * 0.98, 0.04, grid.cellFt * 0.98),
    new THREE.MeshBasicMaterial({ color: 0xf1ead9, transparent: true, opacity: 0.16 }),
  );
  hover.visible = false;
  hover.name = "plot:hover";
  group.add(hover);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const colour = new THREE.Color();

  const sync = (next: PlotGrid): void => {
    let cropCount = 0;
    next.cells.forEach((cell, index) => {
      const centre = cellCentre(next, index);
      position.set(centre.x, baseY + 0.06, centre.y);
      quaternion.identity();
      scale.set(cell.tilled ? 1 : 0.82, 1, cell.tilled ? 1 : 0.82);
      matrix.compose(position, quaternion, scale);
      soil.setMatrixAt(index, matrix);
      soil.setColorAt(index, colour.set(cell.tilled ? "#5a4030" : "#3d2c1e"));

      if (!cell.cropId) return;
      const crop = cropById(cell.cropId);
      const height = 0.5 + (cell.stage / Math.max(crop.stages - 1, 1)) * 2.1;
      position.set(centre.x, baseY + 0.12 + height / 2, centre.y);
      scale.set(0.6 + cell.stage * 0.16, height, 0.6 + cell.stage * 0.16);
      matrix.compose(position, quaternion, scale);
      crops.setMatrixAt(cropCount, matrix);
      crops.setColorAt(cropCount, colour.set(crop.colour));
      cropCount += 1;
    });
    soil.instanceMatrix.needsUpdate = true;
    if (soil.instanceColor) soil.instanceColor.needsUpdate = true;
    crops.count = cropCount;
    crops.instanceMatrix.needsUpdate = true;
    if (crops.instanceColor) crops.instanceColor.needsUpdate = true;
  };

  const place = (mesh: THREE.Mesh, index: number | null): void => {
    if (index === null) {
      mesh.visible = false;
      return;
    }
    const centre = cellCentre(grid, index);
    mesh.position.set(centre.x, baseY + 0.1, centre.y);
    mesh.visible = true;
  };

  sync(grid);

  return {
    group,
    sync,
    setHighlights(active, hoverIndex) {
      place(highlight, active);
      place(hover, hoverIndex);
    },
    dispose() {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        }
      });
    },
  };
}
