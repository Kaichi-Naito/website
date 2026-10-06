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
        document.addEventListener('kaichi-ui-ready', function () {
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

        frame.addEventListener('load', syncPage);
        // Soft reboots change the inner DOM/URL without reloading its document.
        window.addEventListener('message', function (event) {
            if (event.origin === root.origin && event.source === frame.contentWindow && event.data === 'kaichi-desktop-page-ready') syncPage();
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
