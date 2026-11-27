function validateRect(rect, label) {
  if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) ||
      rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0 ||
      rect.x + rect.w > 1 + 1e-9 || rect.y + rect.h > 1 + 1e-9) {
    throw new Error(`${label} must have finite normalized x, y, w, h inside the frame.`);
  }
}

function normalizeRegions(regions, enabled) {
  if (typeof enabled !== 'boolean' || !regions || typeof regions !== 'object') {
    throw new Error('regions and a boolean includeFloatingFacecam are required.');
  }
  function convert(region, label) {
    if (!region) return null;
    // Older saved projects sent the crop directly without a source wrapper.
    const source = region.source || region;
    validateRect(source, `${label} source`);
    if (region.placement) {
      validateRect(region.placement, `${label} placement`);
      if (region.placement.w < .2) throw new Error(`${label} placement must be at least 20% wide.`);
    } else if (region.source && label !== 'Gameplay') {
      throw new Error(`${label} placement is required.`);
    }
    return {x:source.x, y:source.y, width:source.w, height:source.h,
      ...(region.placement ? {placement:{...region.placement}} : {})};
  }
  const main = convert(regions.gameplay, 'Gameplay');
  if (!main) throw new Error('Gameplay source is required.');
  const inset = convert(regions.facecam1, 'Facecam 1');
  const inset2 = convert(regions.facecam2, 'Facecam 2');
  return {main, inset:enabled ? inset : null, inset2:enabled ? inset2 : null};
}

function compositionFilter(regions, width = 1080, height = 1920) {
  const crop = rect => {
    validateRect({x:rect.x,y:rect.y,w:rect.width,h:rect.height}, 'Source crop');
    return `crop=w='max(2,trunc(iw*${rect.width}/2)*2)':h='max(2,trunc(ih*${rect.height}/2)*2)':x='trunc(iw*${rect.x}/2)*2':y='trunc(ih*${rect.y}/2)*2'`;
  };
  const faces = [regions.inset, regions.inset2].map((rect,index) => ({rect,index})).filter(face => face.rect);
  const inputs = ['[sourceMain]', ...faces.map((_,index) => `[sourceFace${index}]`)];
  const filters = [`[0:v]split=${inputs.length}${inputs.join('')}`,
    `[sourceMain]${crop(regions.main)},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[base]`];
  let base = 'base';
  faces.forEach(({rect,index},faceIndex) => {
    let placement = rect.placement;
    const layer = `face${faceIndex}`;
    let x, y;
    if (placement) {
      validateRect(placement, 'Facecam placement');
      const w = Math.max(2, Math.round(placement.w * width / 2) * 2);
      const h = Math.max(2, Math.round(placement.h * height / 2) * 2);
      x = Math.min(width-w, Math.max(0, Math.round(placement.x*width)));
      y = Math.min(height-h, Math.max(0, Math.round(placement.y*height)));
      filters.push(`[sourceFace${faceIndex}]${crop(rect)},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1[${layer}]`);
    } else {
      // Preserve the layout of legacy saved jobs without placement coordinates.
      filters.push(`[sourceFace${faceIndex}]${crop(rect)},scale=${Math.round(width*.3/2)*2}:-2,setsar=1[${layer}]`);
      x = index === 0 ? 'W-w-16' : '16';
      y = 'H-h-16';
    }
    const output = `composed${faceIndex}`;
    filters.push(`[${base}][${layer}]overlay=x=${x}:y=${y}[${output}]`);
    base = output;
  });
  filters.push(`[${base}]null[v]`);
  return filters.join(';');
}

module.exports = {normalizeRegions, compositionFilter};
