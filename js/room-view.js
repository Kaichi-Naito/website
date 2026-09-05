(function () {
    'use strict';

    var active = false;
    var busy = false;
    var frame = 0;
    var surface, shared, dialog, scene, photo, hit, toggle;
    var savedScroll = 0;
    var savedOverflow = '';
    var desktopWidth = 0, desktopHeight = 0;
    var currentX = 0, currentY = 0, targetX = 0, targetY = 0;
    var panLimitX = 0, panLimitY = 0;
    var dragging = false, dragged = false, pointerId = null;
    var dragStartedOnScreen = false, captureTarget = null;
    var dragStartX = 0, dragStartY = 0, dragOriginX = 0, dragOriginY = 0;
    var animations = [];
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var imageURL = new URL('../images/room-view-xp.webp', document.currentScript.src).href;

    var IMAGE_WIDTH = 1672;
    var IMAGE_HEIGHT = 941;
    var ROOM_ZOOM = 1.08;
    // Inner edge of the CRT glass in the source photo: TL, TR, BR, BL.
    var SCREEN = [[454, 180], [1204, 180], [1204, 659], [454, 659]];
    var identity = 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)';

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Map a source rectangle to the four corners of the photographed CRT.
    function screenMatrix(points, width, height) {
        var p0 = points[0], p1 = points[1], p2 = points[2], p3 = points[3];
        var dx1 = p1[0] - p2[0], dx2 = p3[0] - p2[0];
        var dy1 = p1[1] - p2[1], dy2 = p3[1] - p2[1];
        var dx3 = p0[0] - p1[0] + p2[0] - p3[0];
        var dy3 = p0[1] - p1[1] + p2[1] - p3[1];
        var denominator = dx1 * dy2 - dx2 * dy1;
        var g = (dx3 * dy2 - dx2 * dy3) / denominator;
        var h = (dx1 * dy3 - dx3 * dy1) / denominator;
        var a = p1[0] - p0[0] + g * p1[0];
        var b = p3[0] - p0[0] + h * p3[0];
        var d = p1[1] - p0[1] + g * p1[1];
        var e = p3[1] - p0[1] + h * p3[1];
        return 'matrix3d(' + [a / width, d / width, 0, g / width,
            b / height, e / height, 0, h / height,
            0, 0, 1, 0, p0[0], p0[1], 0, 1].join(',') + ')';
    }

    function sourceScreenSize() {
        var top = Math.hypot(SCREEN[1][0] - SCREEN[0][0], SCREEN[1][1] - SCREEN[0][1]);
        var bottom = Math.hypot(SCREEN[2][0] - SCREEN[3][0], SCREEN[2][1] - SCREEN[3][1]);
        var left = Math.hypot(SCREEN[3][0] - SCREEN[0][0], SCREEN[3][1] - SCREEN[0][1]);
        var right = Math.hypot(SCREEN[2][0] - SCREEN[1][0], SCREEN[2][1] - SCREEN[1][1]);
        return { width: (top + bottom) / 2, height: (left + right) / 2 };
    }

    // Crop the wide browser viewport before mapping it to the old CRT.
    // This avoids the vertical stretching that occurred when the whole viewport
    // was squeezed directly into the monitor's squarer aspect ratio.
    function desktopCrop() {
        var screenSize = sourceScreenSize();
        var targetAspect = screenSize.width / screenSize.height;
        var cropX = 0, cropY = 0, cropWidth = desktopWidth, cropHeight = desktopHeight;
        if (desktopWidth / desktopHeight > targetAspect) {
            cropWidth = desktopHeight * targetAspect;
            cropX = (desktopWidth - cropWidth) / 2;
        } else {
            cropHeight = desktopWidth / targetAspect;
            cropY = (desktopHeight - cropHeight) / 2;
        }
        return {
            x: cropX,
            y: cropY,
            width: cropWidth,
            height: cropHeight,
            right: desktopWidth - cropX - cropWidth,
            bottom: desktopHeight - cropY - cropHeight
        };
    }

    function geometry() {
        var w = window.innerWidth, h = window.innerHeight;
        // Uniform scaling only: keep the supplied first-person photo at its native aspect ratio.
        var scale = Math.max(w / IMAGE_WIDTH, h / IMAGE_HEIGHT) * ROOM_ZOOM;
        var scaledWidth = IMAGE_WIDTH * scale;
        var scaledHeight = IMAGE_HEIGHT * scale;
        panLimitX = Math.max(0, (scaledWidth - w) / 2 - 2);
        panLimitY = Math.max(0, (scaledHeight - h) / 2 - 2);
        targetX = clamp(targetX, -panLimitX, panLimitX);
        targetY = clamp(targetY, -panLimitY, panLimitY);
        currentX = clamp(currentX, -panLimitX, panLimitX);
        currentY = clamp(currentY, -panLimitY, panLimitY);

        var x = (w - scaledWidth) / 2 + currentX;
        var y = (h - scaledHeight) / 2 + currentY;
        var points = SCREEN.map(function (p) {
            return [x + p[0] * scale, y + p[1] * scale];
        });

        var crop = desktopCrop();
        var matrix = screenMatrix(points, crop.width, crop.height);
        var screenTransform = matrix + ' translate3d(' + (-crop.x) + 'px,' + (-crop.y) + 'px,0)';
        var screenClip = 'inset(' + crop.y + 'px ' + crop.right + 'px ' + crop.bottom + 'px ' + crop.x + 'px round 1.8% / 2.8%)';

        // Start the transition with the photographed CRT glass covering the viewport.
        // The scale stays uniform here as well, so the room never gets stretched.
        var screenSize = sourceScreenSize();
        var nearScale = Math.max(w / screenSize.width, h / screenSize.height) * 1.015;
        var centerX = (SCREEN[0][0] + SCREEN[1][0] + SCREEN[2][0] + SCREEN[3][0]) / 4;
        var centerY = (SCREEN[0][1] + SCREEN[1][1] + SCREEN[2][1] + SCREEN[3][1]) / 4;
        var nearX = w / 2 - centerX * nearScale;
        var nearY = h / 2 - centerY * nearScale;

        return {
            screen: screenTransform,
            clip: screenClip,
            photo: 'matrix(' + [scale, 0, 0, scale, x, y].join(',') + ')',
            photoNear: 'matrix(' + [nearScale, 0, 0, nearScale, nearX, nearY].join(',') + ')'
        };
    }

    function paint() {
        var g = geometry();
        document.body.style.setProperty('--room-screen-transform', g.screen);
        document.body.style.setProperty('--room-screen-clip', g.clip);
        photo.style.transform = g.photo;
        hit.style.transform = g.screen;
        hit.style.clipPath = g.clip;
        return g;
    }

    function updateSize() {
        desktopWidth = window.innerWidth;
        desktopHeight = window.innerHeight;
        document.body.style.setProperty('--room-desktop-width', desktopWidth + 'px');
        document.body.style.setProperty('--room-desktop-height', desktopHeight + 'px');
        hit.style.width = desktopWidth + 'px';
        hit.style.height = desktopHeight + 'px';
        paint();
    }

    function animationOptions() {
        return { duration: 1350, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' };
    }

    function animateView(entering) {
        if (motion.matches || !surface.animate) return Promise.resolve();
        var g = geometry();
        var options = animationOptions();
        var fromTransform = entering ? identity : g.screen;
        var toTransform = entering ? g.screen : identity;
        var fromClip = entering ? 'inset(0px 0px 0px 0px round 0% / 0%)' : g.clip;
        var toClip = entering ? g.clip : 'inset(0px 0px 0px 0px round 0% / 0%)';

        animations = [surface, shared].map(function (element) {
            return element.animate([
                { transform: fromTransform, clipPath: fromClip },
                { transform: toTransform, clipPath: toClip }
            ], options);
        });
        animations.push(photo.animate([
            {
                transform: entering ? g.photoNear : g.photo,
                opacity: entering ? 0 : 1,
                filter: entering ? 'brightness(1.08)' : 'brightness(1)'
            },
            {
                transform: entering ? g.photo : g.photoNear,
                opacity: entering ? 1 : 0,
                filter: entering ? 'brightness(1)' : 'brightness(1.08)'
            }
        ], options));
        return Promise.all(animations.map(function (a) { return a.finished.catch(function () {}); }))
            .then(function () {
                animations.forEach(function (a) { a.cancel(); });
                animations = [];
            });
    }

    function loadPhoto() {
        if (photo.complete && photo.naturalWidth) return Promise.resolve();
        if (photo.decode) return photo.decode();
        return new Promise(function (resolve, reject) {
            photo.onload = resolve;
            photo.onerror = reject;
        });
    }

    async function enter() {
        if (active || busy) return;
        busy = true;
        toggle.disabled = true;
        toggle.setAttribute('aria-busy', 'true');
        try {
            if (!photo.getAttribute('src')) photo.src = imageURL;
            await loadPhoto();
            savedScroll = window.scrollY;
            savedOverflow = document.body.style.overflow;
            window.scrollTo(0, 0);
            document.body.style.overflow = 'hidden';
            active = true;
            currentX = currentY = targetX = targetY = 0;
            scene.hidden = false;
            updateSize();
            document.body.classList.add('room-view-open');
            dialog.showModal();
            dialog.focus({ preventScroll: true });
            await animateView(true);
        } catch (error) {
            if (active) restore();
            photo.removeAttribute('src');
            console.warn('Room view could not be opened.', error);
            return;
        } finally {
            busy = false;
            toggle.disabled = false;
            toggle.removeAttribute('aria-busy');
        }
    }

    function restore() {
        active = false;
        dragging = dragged = false;
        dragStartedOnScreen = false;
        captureTarget = null;
        pointerId = null;
        cancelAnimationFrame(frame);
        frame = 0;
        animations.forEach(function (a) { a.cancel(); });
        animations = [];
        document.body.classList.remove('room-view-open');
        document.body.style.removeProperty('--room-desktop-width');
        document.body.style.removeProperty('--room-desktop-height');
        document.body.style.removeProperty('--room-screen-transform');
        document.body.style.removeProperty('--room-screen-clip');
        document.body.style.overflow = savedOverflow;
        scene.hidden = true;
        if (dialog.open) dialog.close();
        window.scrollTo(0, savedScroll);
        toggle.focus({ preventScroll: true });
    }

    async function leave() {
        if (!active || busy) return;
        busy = true;
        dragging = false;
        cancelAnimationFrame(frame);
        frame = 0;
        await animateView(false);
        restore();
        busy = false;
    }

    function tick() {
        frame = 0;
        if (!active || busy || motion.matches) return;
        currentX += (targetX - currentX) * .16;
        currentY += (targetY - currentY) * .16;
        paint();
        if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > .08) {
            frame = requestAnimationFrame(tick);
        }
    }

    function requestPanFrame() {
        if (!frame) frame = requestAnimationFrame(tick);
    }

    function beginDrag(event) {
        if (!active || busy || motion.matches || event.button > 0) return;
        dragging = true;
        dragged = false;
        pointerId = event.pointerId;
        dragStartedOnScreen = event.target === hit;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        dragOriginX = targetX;
        dragOriginY = targetY;
        dialog.classList.add('is-dragging');
        captureTarget = event.target && event.target.setPointerCapture ? event.target : dialog;
        if (captureTarget.setPointerCapture) captureTarget.setPointerCapture(pointerId);
    }

    function drag(event) {
        if (!dragging || event.pointerId !== pointerId || !active || busy) return;
        var dx = event.clientX - dragStartX;
        var dy = event.clientY - dragStartY;
        if (Math.hypot(dx, dy) > 6) dragged = true;
        targetX = clamp(dragOriginX + dx * .82, -panLimitX, panLimitX);
        targetY = clamp(dragOriginY + dy * .82, -panLimitY, panLimitY);
        requestPanFrame();
        if (event.cancelable) event.preventDefault();
    }

    function endDrag(event) {
        if (!dragging || event.pointerId !== pointerId) return;
        var shouldLeave = event.type === 'pointerup' && dragStartedOnScreen && !dragged;
        dragging = false;
        if (captureTarget && captureTarget.releasePointerCapture && captureTarget.hasPointerCapture && captureTarget.hasPointerCapture(pointerId)) {
            captureTarget.releasePointerCapture(pointerId);
        }
        pointerId = null;
        captureTarget = null;
        dragStartedOnScreen = false;
        dialog.classList.remove('is-dragging');
        if (shouldLeave) leave();
    }

    function init() {
        var nextToggle = document.getElementById('room-view-toggle');
        if (!nextToggle || nextToggle.dataset.roomReady) return;
        toggle = nextToggle;
        surface = document.getElementById('desktop-surface');
        shared = document.getElementById('common-ui-root');
        if (!surface || !shared || !window.HTMLDialogElement) {
            toggle.hidden = true;
            return;
        }
        toggle.dataset.roomReady = 'true';
        toggle.title = '部屋を見る';
        active = busy = false;
        document.body.classList.remove('room-view-open');

        scene = document.createElement('div');
        scene.id = 'room-view-scene';
        scene.hidden = true;
        scene.setAttribute('aria-hidden', 'true');
        photo = document.createElement('img');
        photo.id = 'room-view-photo';
        photo.alt = '';
        photo.width = IMAGE_WIDTH;
        photo.height = IMAGE_HEIGHT;
        photo.draggable = false;
        scene.appendChild(photo);
        document.body.appendChild(scene);

        dialog = document.createElement('dialog');
        dialog.id = 'room-view-dialog';
        dialog.tabIndex = -1;
        dialog.setAttribute('aria-label', '薄暗い部屋からPCを見る');
        dialog.innerHTML = '<button type="button" id="room-view-screen-hit" aria-label="PC画面に戻る"></button>' +
            '<p class="room-view-hint">ドラッグで見渡す<br>画面をクリックで戻る</p>';
        document.body.appendChild(dialog);
        hit = document.getElementById('room-view-screen-hit');

        toggle.addEventListener('click', enter);
        dialog.addEventListener('pointerdown', beginDrag);
        dialog.addEventListener('pointermove', drag);
        dialog.addEventListener('pointerup', endDrag);
        dialog.addEventListener('pointercancel', endDrag);
        hit.addEventListener('click', function (event) {
            // Pointer clicks are handled on pointerup so drag gestures cannot accidentally exit.
            if (event.detail === 0) leave();
            dragged = false;
        });
        dialog.addEventListener('cancel', function (event) {
            event.preventDefault();
            leave();
        });
        dialog.addEventListener('close', function () {
            if (active) restore();
        });
    }

    window.addEventListener('resize', function () {
        if (!active) return;
        animations.forEach(function (a) { a.cancel(); });
        currentX = currentY = targetX = targetY = 0;
        updateSize();
    });
    document.addEventListener('kaichi-ui-ready', init);
    window.KaichiRoomView = { init: init };
    init();
})();
