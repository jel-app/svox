
class Deformer {
  
  static changeShape(model, shape) {
    switch (shape) {
      case 'sphere' : this._circularDeform(model, 1, 1, 1); break;
      case 'cylinder-x' : this._circularDeform(model, 0, 1, 1); break;
      case 'cylinder-y' : this._circularDeform(model, 1, 0, 1); break;
      case 'cylinder-z' : this._circularDeform(model, 1, 1, 0); break;
      case 'box': break;
      default: break;
    }
  }

  static _circularDeform(model, xStrength, yStrength, zStrength) {
    let xMid = (model.voxels.minX + model.voxels.maxX)/2 + 0.5;
    let yMid = (model.voxels.minY + model.voxels.maxY)/2 + 0.5;
    let zMid = (model.voxels.minZ + model.voxels.maxZ)/2 + 0.5;    

    const { vertX, vertY, vertZ, vertRing } = model;

    for (let vertIndex = 0, c = model.vertCount; vertIndex < c; vertIndex++) {
      const vx = vertX[vertIndex];
      const vy = vertY[vertIndex];
      const vz = vertZ[vertIndex];

      const x = (vx - xMid);
      const y = (vy - yMid);
      const z = (vz - zMid);

      const sphereSize = Math.max(Math.abs(x * xStrength), Math.abs(y * yStrength), Math.abs(z * zStrength));
      const vertexDistance = Math.sqrt(x*x*xStrength + y*y*yStrength + z*z*zStrength);
      if (vertexDistance === 0) continue;
      const factor = sphereSize / vertexDistance;

      vertX[vertIndex] = x*((1-xStrength) + (xStrength)*factor) + xMid;
      vertY[vertIndex] = y*((1-yStrength) + (yStrength)*factor) + yMid;
      vertZ[vertIndex] = z*((1-zStrength) + (zStrength)*factor) + zMid;
      vertRing[vertIndex] = sphereSize;
    }

    this._markEquidistantFaces(model);
  }  
  
    
  static _markEquidistantFaces(model) {
    const { faceVertIndices, vertRing, faceEquidistant } = model;

    for (let faceIndex = 0, c = model.faceCount; faceIndex < c; faceIndex++) {
      const faceVertIndex0 = faceIndex * 3;
      const faceVertIndex1 = faceVertIndex0 + 1;
      const faceVertIndex2 = faceVertIndex0 + 2;
      const faceVertIndex3 = faceVertIndex0 + 3;

      faceEquidistant.set(faceIndex, vertRing[faceVertIndices[faceVertIndex0]] === vertRing[faceVertIndices[faceVertIndex1]] &&
        vertRing[faceVertIndices[faceVertIndex0]] === vertRing[faceVertIndices[faceVertIndex2]] &&
        vertRing[faceVertIndices[faceVertIndex0]] === vertRing[faceVertIndices[faceVertIndex3]] ? 1 : 0);
    }
  }
  
  static maximumDeformCount(model) {
    let maximumCount = 0;
    model.materials.forEach(function(material) {
      if (material.deform)
        maximumCount = Math.max(maximumCount, material.deform.count)
    });
    return maximumCount;
  }
  
  static deform(model, maximumDeformCount) {
    const { vertLinkIndices, vertLinkCounts, vertDeformCount, vertDeformDamping, vertDeformStrength, vertFlattenedX, vertFlattenedY, vertFlattenedZ, vertClampedX, vertClampedY, vertClampedZ, vertX, vertY, vertZ, vertTmpX, vertTmpY, vertTmpZ, vertHasTmp } = model;

    for (let step = 0; step < maximumDeformCount; step++) {
      let hasDeforms = false;

      for (let vertIndex = 0, c = model.vertCount; vertIndex < c; vertIndex++) {
        const deformCount = vertDeformCount[vertIndex];
        if (deformCount <= step) continue;

        const vertLinkCount = vertLinkCounts[vertIndex];
        if (vertLinkCount === 0) continue;

        hasDeforms = true;

        const vx = vertX[vertIndex];
        const vy = vertY[vertIndex];
        const vz = vertZ[vertIndex];

        const deformDamping = vertDeformDamping[vertIndex];
        const deformStrength = vertDeformStrength[vertIndex];
        const notClampOrFlattenX = 1 - (vertClampedX.get(vertIndex) | vertFlattenedX.get(vertIndex));
        const notClampOrFlattenY = 1 - (vertClampedY.get(vertIndex) | vertFlattenedY.get(vertIndex));
        const notClampOrFlattenZ = 1 - (vertClampedZ.get(vertIndex) | vertFlattenedZ.get(vertIndex));

        let x = 0, y = 0, z = 0;

        for (let i = 0 ; i < vertLinkCount; i++) {
          const linkIndex = vertLinkIndices[vertIndex * 6 + i];
          x += vertX[linkIndex];
          y += vertY[linkIndex];
          z += vertZ[linkIndex];
        }

        const strength = Math.pow(deformDamping, step) * deformStrength;

        const offsetX = x / vertLinkCount - vx;
        const offsetY = y / vertLinkCount - vy;
        const offsetZ = z / vertLinkCount - vz;

        vertTmpX[vertIndex] = vx + notClampOrFlattenX * offsetX * strength;
        vertTmpY[vertIndex] = vy + notClampOrFlattenY * offsetY * strength;
        vertTmpZ[vertIndex] = vz + notClampOrFlattenZ * offsetZ * strength;
        vertHasTmp.set(vertIndex, notClampOrFlattenX | notClampOrFlattenY | notClampOrFlattenZ);
      }

      if (hasDeforms) {
        for (let vertIndex = 0, c = model.vertCount; vertIndex < c; vertIndex++) {
          if (vertHasTmp.get(vertIndex) === 0) continue;

          vertX[vertIndex] = vertTmpX[vertIndex];
          vertY[vertIndex] = vertTmpY[vertIndex];
          vertZ[vertIndex] = vertTmpZ[vertIndex];
        }

        vertHasTmp.clear();
      }
    }
  }
  
  static warpAndScatter(model) {
    let noise = SVOX.Noise().noise;
    let voxels = model.voxels;
    let { nx: tnx, px: tpx, ny: tny, py: tpy, nz: tnz, pz: tpz } = model._tile;
    let tile = model._tile;

    let { minX: vxMinX, minY: vxMinY, minZ: vxMinZ, maxX: vxMaxX, maxY: vxMaxY, maxZ: vxMaxZ } = voxels;
    const { vertX, vertY, vertZ, vertWarpAmplitude, vertWarpFrequency, vertScatter, vertFlattenedX, vertFlattenedY, vertFlattenedZ, vertClampedX, vertClampedY, vertClampedZ } = model;

    vxMinX += 0.1;
    vxMinY += 0.1;
    vxMinZ += 0.1;
    vxMaxX += 0.9;
    vxMaxY += 0.9;
    vxMaxZ += 0.9;
    
    for (let vertIndex = 0, c = model.vertCount; vertIndex < c; vertIndex++) {
      const vx = vertX[vertIndex];
      const vy = vertY[vertIndex];
      const vz = vertZ[vertIndex];

      // In case of tiling, do not warp or scatter the edges
      if ((tnx && vx < vxMinX) || 
          (tpx && vx > vxMaxX) ||
          (tny && vy < vxMinY) || 
          (tpy && vy > vxMaxY) ||
          (tnz && vz < vxMinZ) || 
          (tpz && vz > vxMaxZ))
        continue;
      
      const amplitude = vertWarpAmplitude[vertIndex];
      const frequency = vertWarpFrequency[vertIndex];
      const scatter = vertScatter[vertIndex];
      const hasAmplitude = amplitude > 0;
      const hasScatter = scatter > 0;

      if (hasAmplitude || hasScatter) {
        let xOffset = 0, yOffset = 0, zOffset = 0;

        if (hasAmplitude) {
          xOffset = noise( (vx+0.19) * frequency, vy * frequency, vz * frequency) * amplitude;
          yOffset = noise( (vy+0.17) * frequency, vz * frequency, vx * frequency) * amplitude;
          zOffset = noise( (vz+0.13) * frequency, vx * frequency, vy * frequency) * amplitude;
        }

        if (hasScatter) {
          xOffset += (Math.random() * 2 - 1) * scatter;
          yOffset += (Math.random() * 2 - 1) * scatter;
          zOffset += (Math.random() * 2 - 1) * scatter;
        }

        const notClampOrFlattenX = 1 - (vertClampedX.get(vertIndex) | vertFlattenedX.get(vertIndex));
        const notClampOrFlattenY = 1 - (vertClampedY.get(vertIndex) | vertFlattenedY.get(vertIndex));
        const notClampOrFlattenZ = 1 - (vertClampedZ.get(vertIndex) | vertFlattenedZ.get(vertIndex));

        vertX[vertIndex] = vx + notClampOrFlattenX * xOffset;
        vertY[vertIndex] = vy + notClampOrFlattenY * yOffset;
        vertZ[vertIndex] = vz + notClampOrFlattenZ * zOffset;
      }
    }
  }
}
