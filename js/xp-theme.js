(function () {
    'use strict';
    function icon(kind) {
        var art = {
            computer: '<rect x="4" y="3" width="23" height="18" rx="2" fill="url(#blue)" stroke="#52658b"/><rect x="6" y="5" width="19" height="13" fill="#78deff"/><path d="M7 6h17L7 17Z" fill="#c6f6ff" opacity=".6"/><path d="M12 22v3H7v3h17v-3h-5v-3" fill="#bfc6dc" stroke="#6b789a"/><rect x="25" y="10" width="6" height="19" rx="1" fill="url(#silver)" stroke="#63728f"/><path d="M26 14h4m-4 3h4" stroke="#63728f"/><circle cx="28" cy="25" r="1" fill="#69c858"/>',
            folder: '<path d="M3 8V5h10l3 3h13v19H3Z" fill="#f7cd54" stroke="#bd8826"/><path d="M6 6h6l3 3h12v15H6Z" fill="#fff6ce"/><path d="M3 13h27l-4 15H1Z" fill="url(#gold)" stroke="#bd8826"/><path d="M4 15h24" stroke="#fff5aa"/>',
            disc: '<circle cx="16" cy="16" r="14" fill="url(#silver)" stroke="#7a86a1"/><path d="m16 16-3-13a14 14 0 0 1 12 3Z" fill="#fff" opacity=".85"/><path d="m16 16 12 7a14 14 0 0 1-14 7Z" fill="#819de6" opacity=".7"/><circle cx="16" cy="16" r="4" fill="#d7e8fc" stroke="#7a86a1"/><circle cx="16" cy="16" r="1.5" fill="#66819c"/>',
            music: '<path d="M6 2h15l6 6v23H6Z" fill="url(#silver)" stroke="#7486a3"/><path d="M21 2v7h6" fill="#fff" stroke="#7486a3"/><path d="M14 14v12m0-12 10-3v12m-10-6 10-3" fill="none" stroke="#3f81db" stroke-width="2.5"/><ellipse cx="11" cy="26" rx="4" ry="3" fill="#3f81db"/><ellipse cx="21" cy="23" rx="4" ry="3" fill="#3f81db"/>',
            video: '<circle cx="16" cy="16" r="14" fill="url(#blue)" stroke="#155ba5"/><circle cx="16" cy="16" r="11" fill="#40aff9"/><path d="m12 7 13 9-13 9Z" fill="#ffc640" stroke="#bd8b1e"/>',
            mail: '<rect x="2" y="7" width="28" height="20" rx="1" fill="url(#silver)" stroke="#627d9d"/><path d="m2 8 14 10L30 8M3 26l9-10m17 10-9-10" fill="none" stroke="#8197b6"/><path d="M3 8h26L16 17Z" fill="#fff"/>',
            network: '<circle cx="16" cy="16" r="13" fill="url(#blue)" stroke="#175f9f"/><path d="m10 4-3 6 5 4-1 5 5 2 3 7 6-8-4-5 3-4-7-1-2-6Z" fill="#67c45c"/><path d="M4 16h24M16 3c-9 7-9 19 0 26m0-26c9 7 9 19 0 26" fill="none" stroke="#c6eaff" opacity=".55"/>',
            power: '<rect x="2" y="2" width="28" height="28" rx="4" fill="url(#red)" stroke="#aa3a1a"/><path d="M16 6v10m-5-8a9 9 0 1 0 10 0" fill="none" stroke="#fff" stroke-width="2.5"/>',
            flag: '<path d="M3 5c4-2 8-2 12 0v10c-4-2-8-2-12 0Z" fill="#ef6833"/><path d="M17 6c4 2 8 2 12 0v10c-4 2-8 2-12 0Z" fill="#70ba33"/><path d="M3 17c4-2 8-2 12 0v10c-4-2-8-2-12 0Z" fill="#32a6e8"/><path d="M17 18c4 2 8 2 12 0v10c-4 2-8 2-12 0Z" fill="#f9d837"/>'
        };
        return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="blue" x2=".7" y2="1"><stop stop-color="#c8ebff"/><stop offset=".5" stop-color="#509df0"/><stop offset="1" stop-color="#2863bc"/></linearGradient><linearGradient id="silver" x2=".7" y2="1"><stop stop-color="#fff"/><stop offset=".6" stop-color="#d5def1"/><stop offset="1" stop-color="#91a5cf"/></linearGradient><linearGradient id="gold" x2=".3" y2="1"><stop stop-color="#fff2a1"/><stop offset=".5" stop-color="#ffd764"/><stop offset="1" stop-color="#e9a733"/></linearGradient><linearGradient id="red" x2=".4" y2="1"><stop stop-color="#fcb9a0"/><stop offset=".45" stop-color="#e87046"/><stop offset="1" stop-color="#cb330c"/></linearGradient></defs>' + (art[kind] || art.folder) + '</svg>');
    }
    var windowIcons = { 'win-profile': 'computer', 'win-counter': 'computer', 'win-phalux': 'disc', 'win-social': 'network', 'win-spotify': 'music', 'win-youtube': 'video', 'win-cat-warning': 'flag', 'win-nyan-special': 'folder' };
    function menuItem(label, kind, target, subtitle) {
        var item = document.createElement(target.indexOf('win-') === 0 ? 'button' : 'a');
        item.className = 'start-menu-item';
        if (item.tagName === 'BUTTON') {
            item.type = 'button';
            item.addEventListener('click', function () {
                var win = document.getElementById(target);
                if (win) { window.KaichiUI.showWindow(win); win.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
                closeMenu();
            });
        } else {
            item.href = target;
            if (/^https:/.test(target)) { item.target = '_blank'; item.rel = 'noopener noreferrer'; }
        }
        var img = document.createElement('img'); img.src = icon(kind); img.alt = '';
        var text = document.createElement('span');
        var strong = document.createElement('strong'); strong.textContent = label; text.appendChild(strong);
        if (subtitle) { var small = document.createElement('small'); small.textContent = subtitle; text.appendChild(small); }
        item.append(img, text);
        return item;
    }
    var originalMenu, originalStart, originalShutdownImage;
    var menuObserver, taskObserver;
    var menuBindingsReady = false;
    function resetToWindows95() {
        document.body.classList.remove('xp-desktop');
        var menu = document.getElementById('start-menu');
        var start = document.getElementById('taskbar-start-btn');
        var shutdown = document.getElementById('shutdown-menu-item');
        if (!start || !start.dataset.xpReady) return;
        if (menuObserver) menuObserver.disconnect();
        if (taskObserver) taskObserver.disconnect();
        originalMenu[1].appendChild(shutdown);
        menu.replaceChildren.apply(menu, originalMenu);
        start.innerHTML = originalStart;
        delete start.dataset.xpReady;
        shutdown.querySelector('img').src = originalShutdownImage;
        shutdown.querySelector('span').textContent = 'シャットダウン';
        document.querySelectorAll('.window, .win95-taskbar-tab').forEach(function (node) { node.style.removeProperty('--xp-icon'); });
    }
    function closeMenu() {
        var menu = document.getElementById('start-menu'), start = document.getElementById('taskbar-start-btn');
        menu.classList.remove('open'); menu.setAttribute('aria-hidden', 'true');
        start.classList.remove('start-open'); start.setAttribute('aria-expanded', 'false');
    }
    function updateIcons() {
        if (!window.KaichiDesktopTheme.isXP()) return;
        document.querySelectorAll('.window, .win95-taskbar-tab').forEach(function (node) {
            var id = node.dataset.windowId || node.id;
            node.style.setProperty('--xp-icon', 'url("' + icon(windowIcons[id] || 'folder') + '")');
        });
    }
    function ready() {
        if (!window.KaichiDesktopTheme.isXP()) { resetToWindows95(); return; }
        document.body.classList.add('xp-desktop');
        var nav = document.getElementById('common-nav');
        nav.querySelectorAll('.desktop-icon').forEach(function (a) {
            if (/\/test\/(?:index\.html)?$/.test(location.pathname) && a.getAttribute('href') === 'index.html') a.href = 'test/';
        });
        updateIcons();
        var start = document.getElementById('taskbar-start-btn');
        if (!start.dataset.xpReady) {
            originalStart = start.innerHTML;
            start.dataset.xpReady = 'true';
            start.innerHTML = '<img alt="" src="' + icon('flag') + '"><span>start</span>';
            start.setAttribute('aria-label', 'スタート');
            start.setAttribute('aria-controls', 'start-menu');
            start.setAttribute('aria-haspopup', 'true');
            start.setAttribute('aria-expanded', 'false');
            var menu = document.getElementById('start-menu');
            var shutdown = document.getElementById('shutdown-menu-item');
            originalMenu = Array.from(menu.children);
            originalShutdownImage = shutdown.querySelector('img').src;
            menu.replaceChildren();
            var user = document.createElement('div'); user.className = 'xp-menu-user';
            var avatar = document.createElement('img'); avatar.src = window.KaichiUI.asset('images/kaichi-avatar.jpg'); avatar.alt = '';
            var name = document.createElement('span'); name.textContent = 'Kaichi'; user.append(avatar, name);
            var links = document.createElement('div'); links.className = 'xp-menu-links';
            nav.querySelectorAll('.desktop-icon').forEach(function (navItem) {
                if (['Discography', 'Plugin', 'Works', 'Contact', 'FREEBGM'].indexOf(navItem.querySelector('span').textContent) === -1) return;
                var item = navItem.cloneNode(true);
                item.className = 'start-menu-item';
                item.querySelector('img').alt = '';
                links.appendChild(item);
            });
            var footer = document.createElement('div'); footer.className = 'xp-menu-footer';
            var os = document.createElement('span'); os.textContent = '@Kaichi_zZ';
            shutdown.querySelector('img').src = icon('power');
            shutdown.querySelector('span').textContent = 'シャットダウン';
            footer.append(os, shutdown);
            menu.append(user, links, footer);
            menuObserver = new MutationObserver(function () {
                start.setAttribute('aria-expanded', menu.classList.contains('open') ? 'true' : 'false');
            });
            menuObserver.observe(menu, { attributes: true, attributeFilter: ['class'] });
            taskObserver = new MutationObserver(updateIcons);
            taskObserver.observe(document.getElementById('taskbar-tasks'), { childList: true });
            if (!menuBindingsReady) {
                menuBindingsReady = true;
                document.addEventListener('keydown', function (e) {
                    if (e.key === 'Escape' && menu.classList.contains('open')) { closeMenu(); start.focus(); }
                });
                menu.addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });
            }
        }
        var initialWindow = document.getElementById('win-youtube') || document.getElementById('win-profile');
        if (initialWindow) window.KaichiUI.focusWindow(initialWindow);
    }
    document.addEventListener('kaichi-ui-ready', ready);
    document.addEventListener('kaichi-desktop-theme-change', function () {
        if (!window.KaichiDesktopTheme.isXP()) resetToWindows95();
        else if (window.KaichiUI && document.querySelector('#common-nav .desktop-icon')) ready();
    });
    if (window.KaichiUI) ready();
})();
