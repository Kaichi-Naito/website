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
        var desktopHeight = 1024;
        var contentObserver;
        var contentResizeObserver;
        var fitTimer;

        function contentHeight() {
            var doc = frame.contentDocument;
            if (!doc || !doc.body) return desktopHeight;
            var windows = doc.querySelectorAll('.window, .coming-soon-window');
            var elements = windows.length ? windows : doc.body.children;
            var bottom = 0;
            Array.prototype.forEach.call(elements, function (element) {
                if (/^(SCRIPT|STYLE|LINK)$/.test(element.tagName) || element.classList.contains('maximized-window')) return;
                var rect = element.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                // Fixed overlays and viewport-sized maximized windows must not
                // enlarge their own viewport on every measurement.
                for (var node = element; node && node !== doc.body; node = node.parentElement) {
                    if (frame.contentWindow.getComputedStyle(node).position === 'fixed') return;
                }
                bottom = Math.max(bottom, rect.bottom + frame.contentWindow.scrollY);
            });
            var taskbar = doc.getElementById('win95-taskbar');
            var footerSpace = taskbar ? taskbar.getBoundingClientRect().height + 16 : 16;
            return Math.max(1024, Math.ceil(bottom + footerSpace));
        }

        function scheduleFit() {
            clearTimeout(fitTimer);
            // Page layouts also run shortly after kaichi-ui-ready / resize.
            fitTimer = setTimeout(fitDesktop, 180);
        }

        function watchContent() {
            var doc = frame.contentDocument;
            if (!doc || !doc.body) return;
            if (contentObserver) contentObserver.disconnect();
            if (contentResizeObserver) contentResizeObserver.disconnect();
            if (typeof ResizeObserver !== 'undefined') {
                contentResizeObserver = new ResizeObserver(scheduleFit);
                contentResizeObserver.observe(doc.body);
                doc.querySelectorAll('.window, .coming-soon-window').forEach(function (element) {
                    contentResizeObserver.observe(element);
                });
            }
            if (typeof MutationObserver !== 'undefined') {
                contentObserver = new MutationObserver(function (mutations) {
                    if (contentResizeObserver) {
                        mutations.forEach(function (mutation) {
                            mutation.addedNodes.forEach(function (node) {
                                if (node.nodeType !== 1) return;
                                if (node.matches('.window, .coming-soon-window')) contentResizeObserver.observe(node);
                                node.querySelectorAll('.window, .coming-soon-window').forEach(function (element) {
                                    contentResizeObserver.observe(element);
                                });
                            });
                        });
                    }
                    scheduleFit();
                });
                contentObserver.observe(doc.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden']});
            }
            scheduleFit();
        }

        function fitDesktop() {
            var bounds = viewport.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            var rotate = forced || bounds.height > bounds.width;
            var availableWidth = rotate ? bounds.height : bounds.width;
            var availableHeight = rotate ? bounds.width : bounds.height;
            desktopHeight = contentHeight();
            var scale = Math.min(availableWidth / 1366, availableHeight / desktopHeight);
            frame.style.width = '1366px';
            frame.style.height = desktopHeight + 'px';
            // Centre any unused space instead of clipping one edge.
            frame.style.left = ((bounds.width - (rotate ? desktopHeight : 1366) * scale) / 2) + 'px';
            frame.style.top = ((bounds.height - (rotate ? 1366 : desktopHeight) * scale) / 2) + 'px';
            frame.style.transform = rotate
                ? 'translateX(' + (desktopHeight * scale) + 'px) rotate(90deg) scale(' + scale + ')'
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
            watchContent();
        });
        // Soft reboots change the inner DOM/URL without reloading its document.
        window.addEventListener('message', function (event) {
            if (event.origin === root.origin && event.source === frame.contentWindow && event.data === 'kaichi-desktop-page-ready') {
                syncPage();
                watchContent();
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
