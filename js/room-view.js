(function () {
    'use strict';

    var active = false;
    var busy = false;
    var frame = 0;
    var surface, shared, dialog, scene, photo, hit, toggle;
    var savedScroll = 0;
    var savedOverflow = '';
    var desktopWidth = 0, desktopHeight = 0;
    var lookX = 0, lookY = 0, currentX = 0, currentY = 0;
    var animations = [];
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var desktopImageURL = new URL('../images/liminal-room.png', document.currentScript.src).href;
    var mobileImageURL = new URL('../images/liminal-room-mobile.png', document.currentScript.src).href;
    var identity = 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)';

    function isMobileRoom() {
        return window.matchMedia('(max-width: 600px)').matches;
    }

    // Map the existing viewport to the four corners of the photographed screen.
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

    function geometry() {
        var w = window.innerWidth, h = window.innerHeight;
        var mobile = isMobileRoom();
        var imageWidth = mobile ? 941 : 2014;
        var imageHeight = mobile ? 1672 : 1321;
        var screenLeft = mobile ? 369 : 650;
        var screenTop = mobile ? 571 : 400;
        var screenRight = mobile ? 576 : 1333;
        var screenBottom = mobile ? 855 : 878;
        var scale;

        if (mobile) {
            // Fill the portrait viewport without stretching the supplied image.
            scale = Math.max(w / imageWidth, h / imageHeight);
        } else {
            // Preserve the existing desktop behavior exactly.
            scale = Math.min(Math.max(w / imageWidth, h / imageHeight) * 1.04, w * .9 / 685);
        }

        var x = (w - imageWidth * scale) / 2 + currentX;
        var y = (h - imageHeight * scale) / 2 + currentY;
        var points = [
            [screenLeft, screenTop],
            [screenRight, screenTop],
            [screenRight, screenBottom],
            [screenLeft, screenBottom]
        ].map(function (p) {
            return [x + p[0] * scale, y + p[1] * scale];
        });
        var matrix = screenMatrix(points, desktopWidth, desktopHeight);
        var screenWidth = screenRight - screenLeft;
        var screenHeight = screenBottom - screenTop;

        return {
            matrix: matrix,
            photo: 'matrix(' + [scale, 0, 0, scale, x, y].join(',') + ')',
            // At the beginning of the pull-back the photographed screen fills the viewport.
            photoNear: 'matrix(' + [desktopWidth / screenWidth, 0, 0, desktopHeight / screenHeight,
                -screenLeft * desktopWidth / screenWidth,
                -screenTop * desktopHeight / screenHeight].join(',') + ')'
        };
    }

    function paint() {
        var g = geometry();
        document.body.style.setProperty('--room-screen-transform', g.matrix);
        photo.style.transform = g.photo;
        hit.style.transform = g.matrix;
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

    function animateView(entering) {
        if (motion.matches || !surface.animate) return Promise.resolve();
        var g = geometry();
        var options = { duration: 1050, easing: 'cubic-bezier(.22,.75,.2,1)', fill: 'forwards' };
        animations = [surface, shared].map(function (element) {
            return element.animate([
                { transform: entering ? identity : g.matrix },
                { transform: entering ? g.matrix : identity }
            ], options);
        });
        animations.push(photo.animate([
            { transform: entering ? g.photoNear : g.photo, opacity: entering ? 0 : 1 },
            { transform: entering ? g.photo : g.photoNear, opacity: entering ? 1 : 0 }
        ], options));
        return Promise.all(animations.map(function (a) { return a.finished.catch(function () {}); }))
            .then(function () { animations.forEach(function (a) { a.cancel(); }); animations = []; });
    }

    function loadPhoto() {
        var mobile = isMobileRoom();
        var nextURL = mobile ? mobileImageURL : desktopImageURL;
        photo.width = mobile ? 941 : 2014;
        photo.height = mobile ? 1672 : 1321;
        if (photo.getAttribute('src') !== nextURL) photo.src = nextURL;
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
        toggle.textContent = '部屋を読み込み中…';
        try {
            await loadPhoto();
            savedScroll = window.scrollY;
            savedOverflow = document.body.style.overflow;
            window.scrollTo(0, 0);
            document.body.style.overflow = 'hidden';
            active = true;
            currentX = currentY = lookX = lookY = 0;
            scene.hidden = false;
            document.body.classList.add('room-view-open');
            updateSize();
            // Native modal provides focus trapping and makes the desktop inert.
            dialog.showModal();
            await animateView(true);
        } catch (error) {
            if (active) restore();
            photo.removeAttribute('src');
            toggle.textContent = '読み込めませんでした · 再試行';
            console.warn('Room view could not be opened.', error);
            return;
        } finally {
            busy = false;
            toggle.disabled = false;
        }
        toggle.textContent = '部屋を見渡す';
    }

    function restore() {
        active = false;
        cancelAnimationFrame(frame);
        frame = 0;
        animations.forEach(function (a) { a.cancel(); });
        animations = [];
        document.body.classList.remove('room-view-open');
        document.body.style.removeProperty('--room-desktop-width');
        document.body.style.removeProperty('--room-desktop-height');
        document.body.style.removeProperty('--room-screen-transform');
        document.body.style.overflow = savedOverflow;
        scene.hidden = true;
        if (dialog.open) dialog.close();
        window.scrollTo(0, savedScroll);
        toggle.focus({ preventScroll: true });
    }

    async function leave() {
        if (!active || busy) return;
        busy = true;
        cancelAnimationFrame(frame);
        frame = 0;
        await animateView(false);
        restore();
        busy = false;
    }

    function tick() {
        frame = 0;
        if (!active || busy || motion.matches) return;
        currentX += (lookX - currentX) * .09;
        currentY += (lookY - currentY) * .09;
        paint();
        if (Math.abs(lookX - currentX) + Math.abs(lookY - currentY) > .03) {
            frame = requestAnimationFrame(tick);
        }
    }

    function look(event) {
        if (!active || busy || motion.matches) return;
        if (event.pointerType === 'touch' && !event.buttons) return;
        lookX = (event.clientX / window.innerWidth - .5) * -24;
        lookY = (event.clientY / window.innerHeight - .5) * -16;
        if (!frame) frame = requestAnimationFrame(tick);
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
        active = busy = false;
        document.body.classList.remove('room-view-open');
        scene = document.createElement('div');
        scene.id = 'room-view-scene';
        scene.hidden = true;
        scene.setAttribute('aria-hidden', 'true');
        photo = document.createElement('img');
        photo.id = 'room-view-photo';
        photo.alt = '';
        photo.width = 2014;
        photo.height = 1321;
        scene.appendChild(photo);
        document.body.appendChild(scene);

        dialog = document.createElement('dialog');
        dialog.id = 'room-view-dialog';
        dialog.setAttribute('aria-label', '薄暗い部屋からPCを見る');
        dialog.innerHTML = '<button type="button" id="room-view-screen-hit" aria-label="PC画面に戻る"></button>' +
            '<div class="room-view-controls"><p>マウス・ドラッグで見渡す<br>画面を押すとPCに戻ります</p></div>';
        document.body.appendChild(dialog);
        hit = document.getElementById('room-view-screen-hit');
        toggle.addEventListener('click', enter);
        // Avoid treating a touch look-around gesture as a click on the monitor.
        var startX = 0, startY = 0, dragged = false;
        dialog.addEventListener('pointerdown', function (e) {
            startX = e.clientX; startY = e.clientY; dragged = false;
        });
        dialog.addEventListener('pointermove', function (e) {
            if (e.buttons && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) dragged = true;
            look(e);
        });
        hit.addEventListener('click', function (e) { if (e.detail === 0 || !dragged) leave(); });
        dialog.addEventListener('cancel', function (e) { e.preventDefault(); leave(); });
        dialog.addEventListener('close', function () { if (active) restore(); });
    }

    window.addEventListener('resize', function () {
        if (!active) return;
        // Cancel the old geometry animation, then fit the new orientation.
        animations.forEach(function (a) { a.cancel(); });
        currentX = currentY = lookX = lookY = 0;
        updateSize();
    });
    document.addEventListener('kaichi-ui-ready', init);
    window.KaichiRoomView = { init: init };
    init();
})();
