class VertexLinker {
  
  static linkVertices(model, face, faceIndex) {
    const { faceClamped, faceVertIndices, faceVertLinkIndices } = model;

    const clamped = faceClamped.get(faceIndex);

    if (clamped === 1) {
      // Do not link clamped face vertices so the do not pull in the sides on deform.
      // But now this leaves these vertices with only 3 links, which offsets the average.
      // Add the vertex itself to compensate the average.
      // This, for instance, results in straight 45 degree roofs when clamping the sides.
      // This is the only difference in handling flatten vs clamp.
      for (let v = 0; v < 4; v++) {
        const vertIndex = faceVertIndices[faceIndex * 4 + v];

        for (let i = 0; i < 6; i++) {
          if (faceVertLinkIndices[vertIndex * 6 + i] === 0) {
            faceVertLinkIndices[vertIndex * 6 + i] = vertIndex + 1; // Add one b/c zero is empty
            break;
          }
        }
      }
    } else {
      // Link each vertex with its neighbor and back (so not diagonally)
      for (let v = 0; v < 4; v++) {
        const vertIndexFrom = faceVertIndices[faceIndex * 4 + v];
        const vertIndexTo = faceVertIndices[faceIndex * 4 + (v + 1) % 4];

        for (let i = 0; i < 6; i++) {
          if (faceVertLinkIndices[vertIndexFrom * 6 + i] === 0) {
            faceVertLinkIndices[vertIndexFrom * 6 + i] = vertIndexTo + 1; // Add one b/c zero is empty
            break;
          }
        }

        for (let i = 0; i < 6; i++) {
          if (faceVertLinkIndices[vertIndexTo * 6 + i] === 0) {
            faceVertLinkIndices[vertIndexTo * 6 + i] = vertIndexFrom + 1; // Add one b/c zero is empty
            break;
          }
        }
      }
    }

    if (face.skipped)
      return;
    
    if (face.clamped) {
      // Do not link clamped face vertices so the do not pull in the sides on deform.
      // But now this leaves these vertices with only 3 links, which offsets the average.
      // Add the vertex itself to compensate the average.
      // This, for instance, results in straight 45 degree roofs when clamping the sides.
      // This is the only difference in handling flatten vs clamp.
      for (let v = 0; v < 4; v++) {
        let vertex = face.vertices[v];
        if (vertex.links.indexOf(vertex) === -1) {
          vertex.links.push(vertex);
          vertex.nrOfClampedLinks++;
        }
      }
    }
    else {
      // Link each vertex with its neighbor and back (so not diagonally)
      for (let v = 0; v < 4; v++) {
        let vertexFrom = face.vertices[v];
        let vertexTo = face.vertices[(v+1) % 4];
        
        if (vertexFrom.links.indexOf(vertexTo) === -1)
          vertexFrom.links.push(vertexTo);
        if (vertexTo.links.indexOf(vertexFrom) === -1)
          vertexTo.links.push(vertexFrom);
      }
    }  
  }
  
  static fixClampedLinks(model) {
    const voxels = model.voxels;

    const { faceNameIndices, faceEquidistant, faceSmooth, faceFlattened, faceClamped, faceVertX, faceVertY, faceVertZ, faceVertFlatNormalX, faceVertFlatNormalY, faceVertFlatNormalZ, faceVertSmoothNormalX, faceVertSmoothNormalY, faceVertSmoothNormalZ, faceVertBothNormalX, faceVertBothNormalY, faceVertBothNormalZ, faceVertNormalX, faceVertNormalY, faceVertNormalZ, faceMaterials } = model;

    // Clamped sides are ignored when deforming so the clamped side does not pull in the other sodes.
    // This results in the other sides ending up nice and peripendicular to the clamped sides.
    // However, this als makes all of the vertices of the clamped side not deform.
    // This then results in the corners of these sides sticking out sharply with high deform counts.
    
    // Find all vertices that are fully clamped (i.e. not at the edge of the clamped side)
    for (let faceIndex = 0; faceIndex < model.faceCount; faceIndex++) {
      const clamped = faceClamped.get(faceIndex);
      if (clamped === 0) return;
    }

    // Clamped sides are ignored when deforming so the clamped side does not pull in the other sodes.
    // This results in the other sides ending up nice and peripendicular to the clamped sides.
    // However, this als makes all of the vertices of the clamped side not deform.
    // This then results in the corners of these sides sticking out sharply with high deform counts.
    
    // Find all vertices that are fully clamped (i.e. not at the edge of the clamped side)
    voxels.forEach(function(voxel) {
      
      for (let faceName in voxel.faces) {
        let face = voxel.faces[faceName];
        if (face.skipped || !face.clamped)
          continue;

        for (let v = 0; v < 4; v++) {
          let vertex = face.vertices[v];
          vertex.fullyClamped = vertex.fullyClamped || (vertex.nrOfClampedLinks === vertex.links.length);
          if (vertex.fullyClamped)
            vertex.links = [];
        }
 
      }        
    }, this, true);

    // For these fully clamped vertices add links for normal deforming
    voxels.forEach(function(voxel) {
      
      for (let faceName in voxel.faces) {
        let face = voxel.faces[faceName];
        if (face.skipped || !face.clamped) 
          continue;
        
        for (let v = 0; v < 4; v++) {
          let vertexFrom = face.vertices[v];
          let vertexTo = face.vertices[(v+1) % 4];

          if (vertexFrom.fullyClamped && vertexFrom.links.indexOf(vertexTo) === -1) {
            vertexFrom.links.push(vertexTo);
          }
          if (vertexTo.fullyClamped && vertexTo.links.indexOf(vertexFrom) === -1) {
            vertexTo.links.push(vertexFrom);
          }
        }
      }
    }, this, true);
  }   
  
  static logLinks(voxels) {
    voxels.forEach(function(voxel) {      
      for (let faceName in voxel.faces) {
        let face = voxel.faces[faceName];
        if (face.skipped)
          continue;
        
        let log = `VOXEL (${voxel.x},${voxel.y},${voxel.z}):${faceName}\r\n`;
        for (let v = 0; v < 4; v++) {
          let vertex = face.vertices[v];
          vertex.fullyClamped = vertex.fullyClamped || (vertex.nrOfClampedLinks === vertex.links.length);
          log += `    VERTEX (${vertex.x},${vertex.y},${vertex.z}):${vertex.fullyClampes?"fully":""} :`;
          for (let l = 0; l < vertex.links.length; l++) {
            let link = vertex.links[l];
            log += `(${link.x},${link.y},${link.z}) `;          
          }
          log += `\r\n`;
        }
        
        console.log(log);
      }
    }, this, true);
  }
  
}
