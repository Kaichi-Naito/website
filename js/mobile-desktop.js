(function () {
    'use strict';

    var embedded = window.self !== window.top;
    var shell = document.documentElement.hasAttribute('data-mobile-desktop-shell');
    var params = new URLSearchParams(location.search);
    var forced = params.get('view') === 'rotated';
    var phone = window.matchMedia('(max-width: 800px)').matches ||
        (window.matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) <= 800);
    var host = !embedded && (shell || forced || phone);
    var root = new URL('../', document.currentScript.src);
    var excluded = /^(?:T4P(?:-play)?\.html|RhythmGame\.html|rhythm\/)/i;

    // Retain the test page's existing startup guard.
    window.KaichiMobileDesktop = window.KaichiTestRotation = {
        isHost: function () { return host; }
    };

    function isSitePage(url) {
        if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return false;
        var path = url.pathname.slice(root.pathname.length);
        return !excluded.test(path) && path !== 'mobile-desktop.html' &&
            (path === '' || path.endsWith('/') || /\.html$/i.test(path));
    }

    if (embedded) {
        // Other embeds, such as the old counter widget, keep their own layout.
        var managed = window.frameElement && window.frameElement.id === 'rotated-desktop-frame';
        if (!managed) return;
        document.documentElement.classList.add('mobile-pc-frame');
        // Chromium can deliver transformed touch coordinates without scrolling
        // the rotated frame. Scroll in the inner document's coordinate system.
        var gesture = null;
        var momentum = 0;
        function stopMomentum() {
            if (momentum) cancelAnimationFrame(momentum);
            momentum = 0;
        }
        function scrollTarget(target, delta, axis) {
            var rootScroll = document.scrollingElement;
            var position = axis === 'x' ? 'scrollLeft' : 'scrollTop';
            var size = axis === 'x' ? 'scrollWidth' : 'scrollHeight';
            var visible = axis === 'x' ? 'clientWidth' : 'clientHeight';
            for (var node = target; node && node !== rootScroll; node = node.parentElement) {
                var overflow = getComputedStyle(node)[axis === 'x' ? 'overflowX' : 'overflowY'];
                if (!/auto|scroll/.test(overflow) || node[size] <= node[visible] + 1) continue;
                if (delta > 0 ? node[position] < node[size] - node[visible] - 1 : node[position] > 0) return node;
            }
            return rootScroll;
        }
        document.addEventListener('touchstart', function (event) {
            stopMomentum();
            gesture = null;
            if (event.defaultPrevented || event.touches.length !== 1 || event.target.closest('input, textarea, select, [contenteditable], #room-view-dialog')) return;
            var touch = event.touches[0];
            gesture = {id: touch.identifier, startX: touch.clientX, startY: touch.clientY,
                lastX: touch.clientX, lastY: touch.clientY, lastTime: performance.now(), target: event.target, velocity: 0, moved: false};
        }, {passive: true});
        document.addEventListener('touchmove', function (event) {
            if (!gesture || event.touches.length !== 1) { gesture = null; return; }
            var touch = event.touches[0];
            if (touch.identifier !== gesture.id) return;
            var dy = gesture.startY - touch.clientY;
            var dx = gesture.startX - touch.clientX;
            if (!gesture.moved) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
                gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            }
            var delta = gesture.axis === 'x' ? gesture.lastX - touch.clientX : gesture.lastY - touch.clientY;
            gesture.scroller = scrollTarget(gesture.target, delta, gesture.axis);
            if (gesture.axis === 'x' && gesture.scroller === document.scrollingElement) return;
            gesture.position = gesture.axis === 'x' ? 'scrollLeft' : 'scrollTop';
            gesture.moved = true;
            if (event.cancelable) event.preventDefault();
            var now = performance.now();
            gesture.scroller[gesture.position] += delta;
            gesture.velocity = delta / Math.max(8, now - gesture.lastTime);
            gesture.lastX = touch.clientX;
            gesture.lastY = touch.clientY;
            gesture.lastTime = now;
        }, {passive: false});
        document.addEventListener('touchend', function (event) {
            if (!gesture || event.touches.length) return;
            var current = gesture;
            gesture = null;
            if (!current.moved || performance.now() - current.lastTime > 100) return;
            var velocity = Math.max(-3, Math.min(3, current.velocity));
            var last = performance.now();
            function coast(now) {
                var dt = Math.min(32, now - last);
                last = now;
                var before = current.scroller[current.position];
                current.scroller[current.position] += velocity * dt;
                velocity *= Math.pow(0.94, dt / 16);
                if (Math.abs(velocity) < 0.03 || current.scroller[current.position] === before) { momentum = 0; return; }
                momentum = requestAnimationFrame(coast);
            }
            momentum = requestAnimationFrame(coast);
        }, {passive: true});
        document.addEventListener('touchcancel', function () { gesture = null; stopMomentum(); }, {passive: true});
        document.addEventListener('kaichi-ui-ready', function () {
            gesture = null;
            stopMomentum();
            window.parent.postMessage('kaichi-desktop-page-ready', root.origin);
        });
        // Internal navigation opens a fresh page, so games leave the rotated frame.
        document.addEventListener('click', function (event) {
            if (event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            var link = event.target.closest && event.target.closest('a[href]');
            if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
            var url = new URL(link.href, document.baseURI);
            if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
            if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
            if (!isSitePage(url) && !excluded.test(url.pathname.slice(root.pathname.length))) return;
            // The explicit preview option follows navigation only to eligible pages.
            if (window.parent.document.documentElement.dataset.rotationForced === 'true' && isSitePage(url)) {
                url.searchParams.set('view', 'rotated');
                link.href = url.href;
            }
            link.target = '_top';
        });
        return;
    }

    if (!host || (!shell && !isSitePage(new URL(location.href)))) return;
    if (!shell) {
        // A small dedicated host prevents the page's audio/app scripts from running twice.
        var destination = new URL('mobile-desktop.html', root);
        destination.searchParams.set('page', location.href);
        if (forced) destination.searchParams.set('view', 'rotated');
        location.replace(destination.href);
        return;
    }

    var source;
    try { source = new URL(params.get('page') || 'index.html', root); } catch (e) { source = new URL('index.html', root); }
    if (!isSitePage(source)) source = new URL('index.html', root);
    source.searchParams.delete('desktop');
    forced = forced || source.searchParams.get('view') === 'rotated';
    var visibleUrl = source.href;
    if (source.searchParams.get('view') === 'rotated') source.searchParams.delete('view');
    source.searchParams.set('desktop', '1');
    document.documentElement.classList.add('mobile-rotated-host');
    document.documentElement.dataset.rotationForced = String(forced);

    document.addEventListener('DOMContentLoaded', function () {
        var viewport = document.createElement('div');
        viewport.id = 'rotated-desktop-viewport';
        var frame = document.createElement('iframe');
        frame.id = 'rotated-desktop-frame';
        frame.title = 'Kaichi Guitar Music — PC desktop';
        frame.setAttribute('allow', 'autoplay; fullscreen');
        frame.setAttribute('allowfullscreen', '');
        function fitDesktop() {
            var bounds = viewport.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            var rotate = forced || bounds.height > bounds.width;
            var availableWidth = rotate ? bounds.height : bounds.width;
            var availableHeight = rotate ? bounds.width : bounds.height;
            var scale = availableWidth / 1366;
            // Keep a screen-sized inner viewport. The original document owns
            // native scrolling and its fixed taskbar; the host never scrolls.
            frame.style.width = '1366px';
            frame.style.height = (availableHeight / scale) + 'px';
            frame.style.transform = rotate
                ? 'translateX(' + bounds.width + 'px) rotate(90deg) scale(' + scale + ')'
                : 'scale(' + scale + ')';
            viewport.dataset.rotation = rotate ? '90' : '0';
        }

        function syncPage() {
            try {
                var doc = frame.contentDocument;
                var current = new URL(frame.contentWindow.location.href);
                if (!doc || !isSitePage(current)) return;
                current.searchParams.delete('desktop');
                if (forced) current.searchParams.set('view', 'rotated');
                visibleUrl = current.href;
                history.replaceState(null, '', visibleUrl);
                document.title = doc.title;
            } catch (e) {}
        }

        frame.addEventListener('load', function () {
            syncPage();
        });
        // Soft reboots change the inner DOM/URL without reloading its document.
        window.addEventListener('message', function (event) {
            if (event.origin === root.origin && event.source === frame.contentWindow && event.data === 'kaichi-desktop-page-ready') {
                syncPage();
            }
        });
        frame.src = source.href;
        viewport.appendChild(frame);
        document.body.replaceChildren(viewport);
        fitDesktop();
        try { history.replaceState(null, '', visibleUrl); } catch (e) {}
        window.addEventListener('resize', fitDesktop);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', fitDesktop);
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitDesktop).observe(viewport);
    }, { once: true });

})();
