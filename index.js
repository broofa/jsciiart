var FONT = 'Menlo-Bold';
var CHARS = Array(95).fill().map((_,i) => String.fromCharCode(i + 32));

/**
 * jQuery what...???
 */
function $(sel) {
  return document.querySelector(sel);
}

/**
 * Create and return a canvas element that's not attached to the document
 * (useful fo interim work)
 */
function getCanvas(w, h) {
  var worker = document.createElement('canvas');
  worker.width = w;
  worker.height = h;

  return worker;
}

/**
 * Return the gray scale value of a pixel at offset 'i', in the raw pixel
 * array, 'pixels'
 */
function grayValue(pixels, i) {
  return pixels[i] * 0.30 + pixels[i+1] * 0.59 + pixels[i+2] * 0.11;
}

/**
 * Analyze a canvas that a character has been rendered into and return useful
 * information about it.  Specifically, determine the smallest rect that
 * contains all non-white pixels (i.e. the bounding rect for where the
 * character was rendered)
 *
 * Also compute the average gray level (optionally providing a bounding rect
 * for that calculation)
 *
 * canvas: Canvas containing the rendered character
 * b:      Subregion w/in which to work
 */
function getRenderedCharInfo(canvas, b) {
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  var ob = b;

  // Basic dimensions
  var info = ob ? {} :
    {x: w, y: h, w: 0, h: 0};

  b = b || {x: 0, y: 0, w: w, h: h};

  var src = ctx.getImageData(b.x, b.y, b.w, b.h).data;
  info.gray = 0;
  for (var dy = 0, i = 0; dy < b.h; dy++) {
    for (var dx = 0; dx < b.w; dx++, i += 4) {
      var x = b.x + dx, y = b.y + dy;

      // Intensity of this pixel
      var gray = grayValue(src, i);
      info.gray += gray;

      if (!ob && Math.round(gray) < 255) {
        info.x = Math.min(x, info.x);
        info.y = Math.min(y, info.y);
        info.w = Math.max(x - info.x, info.w);
        info.h = Math.max(y - info.y, info.h);
      }
    }
  }

  info.gray /= b.w * b.h;

  return info;
}

/**
 * Figure out which characters render the lightest/darkest
 */
function getCharInfo() {
  var W = 40, H = 40, W2 = W >> 1, H2 = H >> 1;
  var canvas = getCanvas(W, H);
  var ctx = canvas.getContext('2d');

  ctx.font = 'bold 16pt "' + FONT + '"';

  // Render all characters together and then get the bounds within which the
  // actual rendering occured
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'black';
  for (var ci = 0; ci < CHARS.length; ci++) {
    ctx.fillText(CHARS[ci], W2, H2);
  }
  var bounds = getRenderedCharInfo(canvas);

  // Now render each character individually withon those bounds and
  // collect the various traits we're interested in
  var infos = [], grayMin = 1e12, grayMax = 0;
  for (var ci = 0; ci < CHARS.length; ci++) {
    var char = CHARS[ci];

    // Get info about the rendered character
    ctx.font = '16pt "' + FONT + '"';
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'black';
    ctx.fillText(char, W2, H2);
    var info = getRenderedCharInfo(canvas, bounds);

    // adjust origin and annotate with char info
    info.char = char;
    infos.push(info);

    // Keep track of max/min gray across all chars
    grayMin = Math.min(grayMin, info.gray);
    grayMax = Math.max(grayMax, info.gray);
  }

  // Normalize gray levels across
  infos.forEach(function(g) {
    g.gray = (g.gray - grayMin) / (grayMax - grayMin);
    g.gray = Math.round(g.gray * 1000) / 1000;
  });

  // Sort by gray value
  infos.sort(function(a, b) {
    return a.gray - b.gray;
  });

  return infos;
}

onload = function() {
  // Grab elements, create settings, etc.
  var canvas = $('#canvas'),
    video = $('#video'),
    videoObj = { video: true },
    errBack = function(error) {
      console.log('Video capture error: ', error.code);
    };

  var vCanvas = getCanvas(video.width, video.height);
  var ctx = vCanvas.getContext('2d');
  var pre = $('#ascii');
  var infos = getCharInfo();

  function videoToAscii() {
    var iw = video.width, ih = video.height;

    var scale = iw > ih ? (video.height / iw) : (video.width / ih);
    iw *= scale;
    ih *= scale * .58;

    ctx.drawImage(video, 0, 0, iw, ih);
    var id = ctx.getImageData(0, 0, iw, ih);
    var src = id.data;

    // Figure out gray levels for doing auto-contrast.  We start by getting a
    // count of pixels at each of the 256 levels ...
    var counts = Array(256).fill(0);
    var grayMin = 256, grayMax = 0;
    for (var y = 0, i = 0; y < id.height; y++) {
      for (var x = 0; x < id.width; x++, i += 4) {
        counts[Math.floor(grayValue(src, i))] += 1;
      }
    }

    // Then pick our max/min gray values at thresholds that push a few pixels
    // above/below the light/dark thresholds
    var thresh = id.width/2;
    var grayMin, grayMax;
    for (var i = 0, n = 0; n < thresh; i++, n += counts[i], grayMin = i);
    for (var i = 255, n = 0; n < thresh; i--, n += counts[i], grayMax = i);
    var grayDiff = grayMax - grayMin;

    // Avoid divide-by-zero if the frame is all one color for whatever reason
    // (may happy on first frame of stream?)
    if (grayDiff > 0) {
      // Build some ascii art!
      var asciiArtYay = [];
      for (var y = 0, i = 0; y < id.height; y++) {
        for (var x = 0; x < id.width; x++, i += 4) {
          // Map gray value to index into our character map
          var val = infos.length * (grayValue(src, i) - grayMin) / grayDiff;
          val = Math.max(0, Math.min(infos.length - 1, val));

          asciiArtYay.push(infos[Math.floor(val)].char);
        }
        asciiArtYay.push('\n');
      }

      pre.innerText = asciiArtYay.join('');
    }

    requestAnimationFrame(videoToAscii);
  }

  navigator.getMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;


  // Attach video listener
  if (navigator.getMedia) { // Standard
    navigator.getMedia(videoObj, function(stream) {
      video.src = stream;
      video.src = window.URL.createObjectURL(stream);
      video.play();

      // Make it so!
      videoToAscii()
    }, errBack);
  }
}
