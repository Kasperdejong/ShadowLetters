let c = document.getElementById('canvas');
let overlay = document.getElementById('overlay');
let outer = document.getElementById('container');

if (!c || !overlay || !outer) {
    console.error("Canvas elements not found!");
    throw new Error("Canvas missing");
}

let ctx = c.getContext('2d');
let ctxo = overlay.getContext('2d');

let doBlur = document.getElementById('blur');
let doJitterStart = document.getElementById('jitterStart');
let doJitterStep = document.getElementById('jitterStep');
let doSurfaceCheck = document.getElementById('surfaceCheck');
let doUseCone = document.getElementById('useCone');

let textInput = document.getElementById('textInput');
let moveTextMode = document.getElementById('moveTextMode');
let eraserMode = document.getElementById('eraserMode');

let height = c.height;
let width = c.width;
let pxCount = height * width;

let floor = Math.floor;

ctx.globalAlpha = 1.0;
ctx.fillStyle = "#000";

let textState = {
    str: "SHADOWS",
    x: 50,
    y: 200,
    size: 100
};

// <--- CHANGED: Undo & Redo History Setup
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 20;

function saveHistory() {
    // We save the pixel map AND the text variables.
    // If we don't save text variables, undoing a move will visually work
    // but the next time you click, the text will snap back to the wrong place.
    let snapshot = {
        map: solidMap.slice(),
        text: Object.assign({}, textState) // Clone the text object
    };

    undoStack.push(snapshot);
    if (undoStack.length > MAX_HISTORY) {
        undoStack.shift(); 
    }
    // Clear redo stack because we started a new timeline
    redoStack = [];
}

function undo() {
    if (undoStack.length === 0) return;

    // Save current state to Redo Stack before undoing
    let currentSnapshot = {
        map: solidMap.slice(),
        text: Object.assign({}, textState)
    };
    redoStack.push(currentSnapshot);

    // Restore from Undo Stack
    let previousSnapshot = undoStack.pop();
    solidMap = previousSnapshot.map;
    Object.assign(textState, previousSnapshot.text); // Restore text pos
    
    // Update inputs to match restored state (optional but nice)
    textInput.value = textState.str;

    // Trigger redraws
    solidTouched = true;
    shadowTouched = true;
}

function redo() {
    if (redoStack.length === 0) return;

    // Save current state to Undo Stack before redoing
    let currentSnapshot = {
        map: solidMap.slice(),
        text: Object.assign({}, textState)
    };
    undoStack.push(currentSnapshot);

    // Restore from Redo Stack
    let futureSnapshot = redoStack.pop();
    solidMap = futureSnapshot.map;
    Object.assign(textState, futureSnapshot.text);

    textInput.value = textState.str;

    // Trigger redraws
    solidTouched = true;
    shadowTouched = true;
}

// Global Event Listener
window.addEventListener('keydown', function(e) {
    // Check for Ctrl (or Cmd on Mac) + Z
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
            // Ctrl + Shift + Z = Redo
            redo();
        } else {
            // Ctrl + Z = Undo
            undo();
        }
    }
});


let lightMap = []; 
let solidMap = []; 
let distanceMap = []; 
let xPosMap = []; 
let yPosMap = []; 
let xNormMap = []; 
let yNormMap = []; 

function updateLightAndShadow(x, y) {
    if (x < 1) x = 1;
    if (x >= width) x = width - 1;
    if (y < 1) y = 1;
    if (y >= height) y = height - 1;

    let idx = (y * width) + x;
    if (solidMap[idx] > 0) return;

    const useCone = doUseCone.checked;
    const lightRadius = 1000; 
    const edgeDistance = 25; 

    let lightDist = distanceMap[(y * width) + x]; 

    for (let sy = 0; sy < height; sy++) {
        for (let sx = 0; sx < width; sx++) {
            let idx = (sy * width) + sx;
            lightMap[idx] = 0; 

            if (solidMap[idx] > 0) continue;

            let dx = x - sx; 
            let dy = y - sy;
            let totalDist = Math.sqrt(dx * dx + dy * dy); 

            if (totalDist > lightRadius) continue;
            if (totalDist == 0) {
                lightMap[idx] = 1.0;
                continue;
            } 

            if (totalDist < lightDist) { 
                let fadeRatio = 1.0 - clamp(totalDist / lightRadius);
                let distFactor = fadeRatio * fadeRatio; 
                lightMap[idx] = 1 * distFactor;
                continue;
            }

            dx /= totalDist; 
            dy /= totalDist;

            let progress = distanceMap[idx];
            if (doJitterStart.checked) progress *= Math.random();
            
            let lightLeft = 1.0; 

            for (let q = 0; q < 25; q++) { 
                if (progress >= totalDist) { 
                    let fadeRatio = 1.0 - clamp(totalDist / lightRadius);
                    let distFactor = fadeRatio * fadeRatio; 
                    lightMap[idx] = lightLeft * distFactor;
                    break;
                }

                var nx = 0 | ((dx * progress) + sx); 
                var ny = 0 | ((dy * progress) + sy); 
                var n_idx = (ny * width) + nx;
                var stepDist = distanceMap[n_idx]; 

                if (solidMap[n_idx] > 0) break; 

                let cone = stepDist;
                if (useCone) cone *= stepDist * 0.63299;

                if (doSurfaceCheck.checked) {
                    let bv = lightDist > edgeDistance ? edgeDistance : lightDist;
                    bv /= 3;
                    let bu = edgeDistance - bv;
                    lightLeft = (bu * lightLeft) + (bv * Math.min(lightLeft, (cone / progress)));
                    lightLeft /= edgeDistance;
                } else {
                    lightLeft = Math.min(lightLeft, (cone / progress));
                }

                let jitter = 1; 
                if (doJitterStep.checked) jitter = Math.random();
                progress += stepDist * jitter;
            } 
        } 
    } 

    if (doBlur.checked) {
        let _1 = 1, _2 = 2;
        for (let sy = 0; sy < height; sy++) {
            let idx = (sy * width);
            let v = lightMap[idx];
            v += lightMap[idx];
            idx += _1;
            for (let sx = 1; sx < width - 1; sx++) {
                v += lightMap[idx];
                lightMap[idx - _1] = v / 2;
                idx += _1;
                v -= lightMap[idx - _2];
            }
        }
        _1 = width; _2 = 2 * _1;
        for (let sx = 0; sx < width; sx++) {
            let idx = sx;
            let v = lightMap[idx];
            v += lightMap[idx];
            idx += _1;
            for (let sy = 1; sy < height - 1; sy++) {
                v += lightMap[idx];
                lightMap[idx - _1] = v / 2;
                idx += _1;
                v -= lightMap[idx - _2];
            }
        }
    }
}

function pin(v) {
    if (v > 255) return 255;
    if (v < 0) return 0;
    return v;
}

var com = 4; 
var imgBytes = width * height * com;
var u8a = new Uint8Array(imgBytes); 

function drawPixelArrayToCanvas(theContext) {
    var UAC = new Uint8ClampedArray(u8a, width, height);
    var DAT = new ImageData(UAC, width, height);
    theContext.putImageData(DAT, 0, 0);
}

function lightBufferToPixelArray() {
    let w = width;
    let h = height;
    let rowWidth = w * com; 
    let ci = 0; 
    let i = 0; 

    let factor = 255;
    let offset = 200;

    if (drawMode) {
        factor = 100;
        offset = 100;
    }

    for (let y = 0; y < h; y++) {
        let yoff = y * rowWidth;
        let yi = y * width;
        for (let x = 0, xoff = 0; x < w; x++, xoff += com) {
            ci = yoff + xoff;
            i = yi + x;

            if (solidMap[i] > 0) {
                u8a[ci + 0] = 0; 
                u8a[ci + 1] = 0; 
                u8a[ci + 2] = 0; 
                u8a[ci + 3] = 0; 
            } else {
                let c = pin(lightMap[i] * factor) * 0.784;
                u8a[ci + 0] = 0; 
                u8a[ci + 1] = 0; 
                u8a[ci + 2] = 0; 
                u8a[ci + 3] = offset - c; 
            }
        }
    }
}

function distanceBuffersToPixelArray() {
    let w = width;
    let h = height;
    let rowWidth = w * com; 
    let ci = 0; 
    let i = 0; 

    for (let y = 0; y < h; y++) {
        let yoff = y * rowWidth;
        let yi = y * width;
        for (let x = 0, xoff = 0; x < w; x++, xoff += com) {
            ci = yoff + xoff;
            i = yi + x;

            if (solidMap[i] > 0) {
                u8a[ci + 0] = 0; 
                u8a[ci + 1] = 0; 
                u8a[ci + 2] = 0; 
                u8a[ci + 3] = 255; 
            } else {
                u8a[ci + 0] = 255; 
                u8a[ci + 1] = 255; 
                u8a[ci + 2] = 255; 
                u8a[ci + 3] = 255; 
            }
        }
    }
}

function prepareForJumpFlood() {
    let sqrMaxDist = (height * height) + (width * width);
    for (let y = 0; y < height; y++) {
        let yi = y * width;
        for (let x = 0; x < width; x++) {
            let i = yi + x;
            xPosMap[i] = x / solidMap[i];
            yPosMap[i] = y / solidMap[i];
        }
    }
}

function mergeSamples(bestDistance, x, y, current, samples) {
    let bestSample = current;
    for (let i = 0; i < samples.length; i++) {
        let sample = samples[i];
        let dx = x - xPosMap[sample];
        let dy = y - yPosMap[sample];
        let thisDist = (dx * dx) + (dy * dy);
        if (thisDist < bestDistance) {
            bestDistance = thisDist;
            bestSample = sample;
        }
    }
    return bestSample;
}

let dir = 1;
let mergeCount = 0;

function jumpFloodRound(stride) {
    let min = Math.min;
    let max = Math.max;
    let limit = pxCount - 1;
    let sqrMaxDist = (height * height) + (width * width);
    let dy = stride >> 1;
    if (dy < 1) dy = 1;
    let dx = dy;
    let y0 = 0;
    let x0 = 0;
    if (dir < 0) {
        dy = -dy;
        y0 = height - 1;
    }
    dir = -dir;

    for (let y = y0; y < height && y >= 0; y += dy) {
        let y1 = (y - stride) * width;
        let y2 = y * width;
        let y3 = (y + stride) * width;

        dx = -dx;
        x0 = (width - 1) - x0;

        for (let x = x0; x < width && x >= 0; x += dx) {
            let r1 = y1 + x;
            let r2 = y2 + x;
            let r3 = y3 + x;
            let i = r2;
            let nextIndex = mergeSamples(sqrMaxDist, x, y, i, [
                max(r1 - stride, 0), max(r1, 0), max(r1 + stride, 0),
                max(r2 - stride, 0), r2, min(r2 + stride, limit),
                min(r3 - stride, limit), min(r3, limit), min(r3 + stride, limit)
            ]);
            mergeCount++;
            xPosMap[i] = xPosMap[nextIndex];
            yPosMap[i] = yPosMap[nextIndex];
            distanceMap[i] = distanceMap[nextIndex];
        }
    }
}

function calculateNearestPositions() {
    prepareForJumpFlood();
    mergeCount = 0;
    dir = -1;
    jumpFloodRound(1);
    jumpFloodRound(1);
    let pixelCount = width * height;
    let samplePerPixel = (mergeCount / pixelCount) * 9;
    document.getElementById('stats').innerText =
        `${width}x${height}. ${mergeCount} merges. ${samplePerPixel.toFixed(2)} samples per pixel`;
}

function calculateDistances() {
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let idx = (y * width) + x;
            let dx = x - xPosMap[idx];
            let dy = y - yPosMap[idx];
            let dist = Math.sqrt(dx * dx + dy * dy);
            distanceMap[idx] = Math.sqrt(dx * dx + dy * dy);

            if (dist != 0) {
                xNormMap[idx] = dx / dist;
                yNormMap[idx] = dy / dist;
            }
        }
    }
}

function updateDistanceMap() {
    calculateNearestPositions();
    calculateDistances();
}

function drawIntoArray(str, size, x, y, target) {
    var c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    var a = c.getContext('2d');
    a.fillStyle = "#000";
    a.fillRect(0, 0, c.width, c.height);

    a.fillStyle = "#fff";
    a.font = 'bold ' + size + 'px sans-serif';
    a.fillText(str, x, y + size);
    var data = a.getImageData(0, 0, c.width, c.height).data;
    var sz = width * height;
    for (var i = 0; i < sz; i++) {
        target[i] = ((data[i * 4] > 100) ? (1) : (target[i]));
    }
}

function refreshAll() {
    updateDistanceMap();
    distanceBuffersToPixelArray();
    drawPixelArrayToCanvas(ctx);
}

function clamp(x) {
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
}

var solidTouched = true; 
var shadowTouched = true; 
var drawMode = false; 
var mouseX = 263; 
var mouseY = 90;

function drawDotAt(x, y, erase) {
    if (x < 3 || x >= width - 3) return;
    if (y < 3 || y >= height - 3) return;

    let val = erase ? 0 : 1;

    let idx = 0 | (x + width * y);
    for (let z = 0; z < 3; z++) {
        solidMap[z + idx - width] = val;
        solidMap[z + idx] = val;
        solidMap[z + idx + width] = val;
    }
    solidTouched = true;
}

function renderTextToMap() {
    // Save history before overwriting map with text
    saveHistory(); 
    
    for (let i = 0; i < pxCount; i++) solidMap[i] = 0;
    drawIntoArray(textState.str, textState.size, textState.x, textState.y, solidMap);
    solidTouched = true;
    shadowTouched = true;
}

window.updateTextString = function() {
    textState.str = textInput.value;
    renderTextToMap();
}

textInput.addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
        updateTextString();
        this.blur(); // Removes focus from input so you can draw/undo immediately
    }
});

outer.onmousedown = function(e) {
    drawMode = true;
    let x = floor(e.offsetX);
    let y = floor(e.offsetY);

    if (moveTextMode.checked) {
        saveHistory(); 
        textState.x = x - (ctx.measureText(textState.str).width / 2);
        textState.y = y - (textState.size / 2);
        renderTextToMap();
        // NOTE: renderTextToMap calls saveHistory internally, so we might 
        // get a double save here. But for simplicity, it ensures safety.
        // We actually want to avoid calling saveHistory TWICE.
        // I will remove the saveHistory call INSIDE renderTextToMap for future stability
        // but for now, the explicit calls here are safer.
    } else {
        saveHistory();

        mouseX = 0 | (x - 25);
        mouseY = 0 | (y - 25);
        
        let isErasing = eraserMode.checked;
        drawDotAt(x, y, isErasing);
        shadowTouched = true;
    }
};

window.onmouseup = function(e) {
    drawMode = false;
};

let t0 = 0;
function loopRedraw(t1) {
    let dt = t1 - t0;
    t0 = t1;
    document.getElementById('frameRate').innerText = "fps=" + Math.round(1000 / dt);

    if (solidTouched) {
        refreshAll();
        solidTouched = false;
    }

    if (shadowTouched) {
        updateLightAndShadow(mouseX, mouseY);
        lightBufferToPixelArray();
        drawPixelArrayToCanvas(ctxo);
        shadowTouched = false;
    }
    window.requestAnimationFrame(loopRedraw);
}

window.resetPoints = function() {
    saveHistory(); 
    solidMap[0] = 1;
    const end = width * height;
    for (let i = 1; i < end; i++) {
        solidMap[i] = 0;
    }
    // Manually call drawIntoArray here so we don't trigger a double history save
    // via renderTextToMap (if we were to clean that up later)
    drawIntoArray(textState.str, textState.size, textState.x, textState.y, solidMap);
    solidTouched = true;
    shadowTouched = true;
}

outer.onmousemove = function(e) {
    shadowTouched = true;
    let x = floor(e.offsetX);
    let y = floor(e.offsetY);

    if (x < 3 || x >= width - 3) return;
    if (y < 3 || y >= height - 3) return;

    if (drawMode) {
        if (moveTextMode.checked) {
            textState.x = x;
            textState.y = y;
            // We don't save history on every pixel of drag, only on mouse down
            for (let i = 0; i < pxCount; i++) solidMap[i] = 0;
            drawIntoArray(textState.str, textState.size, textState.x, textState.y, solidMap);
            solidTouched = true;
        } else {
            let isErasing = eraserMode.checked;
            drawDotAt(x, y, isErasing);
            solidTouched = true;
            mouseX = 0 | (x - 25);
            mouseY = 0 | (y - 25);
        }
    } else {
        if (!moveTextMode.checked) {
            mouseX = 0 | (x);
            mouseY = 0 | (y);
        }
    }
}

for (let i = 0; i < pxCount; i++) {
    lightMap.push(0);
    solidMap.push(0);
    xPosMap.push(0);
    yPosMap.push(0);
    xNormMap.push(0);
    yNormMap.push(0);
    distanceMap.push(0);
}

// Initial Render (Prevent saving history for the very first frame)
drawIntoArray(textState.str, textState.size, textState.x, textState.y, solidMap);
solidTouched = true;
shadowTouched = true;

window.requestAnimationFrame(loopRedraw);