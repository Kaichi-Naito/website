(function () {
    'use strict';

    var ASSET_BASE = 'https://kaichi-naito.github.io/website/';
    var highestZIndex = 30000;
    var taskbarTasks = null;
    var activeWindowId = null;
    var cats = [];
    var catWarningTriggered = false;
    var catCrashTriggered = false;

    function asset(path) {
        return ASSET_BASE + path.replace(/^\/+/, '');
    }

    function createAudio(path) {
        try {
            var audio = new Audio(asset(path));
            audio.preload = 'auto';
            audio.load();
            return audio;
        } catch (e) {
            return null;
        }
    }

    var mouseClickSound = createAudio('Sound/MouseClick.mp3');
    var shutdownSound = createAudio('Sound/shutdown2.mp3');
    var startupSound = createAudio('Sound/windows.mp3');
    var catSound = createAudio('Sound/CatMeow.mp3');
    var catErrorSound = createAudio('Sound/Error_2.mp3');
    var catCrashSound = createAudio('Sound/Nyancat_x30.mp3');

    function play(audio) {
        if (!audio) return;
        try {
            audio.currentTime = 0;
            audio.play().catch(function(){});
        } catch (e) {}
    }

    function playClickSound() {
        play(mouseClickSound);
    }

    function injectNavigation() {
        var nav = document.getElementById('common-nav');
        if (!nav) return;

        nav.className = 'nav';
        nav.innerHTML =
            '<a href="index.html" class="desktop-icon">' +
                '<img src="' + asset('images/gif/Computer.gif') + '" alt="Home"><span>Home</span>' +
            '</a>' +
            '<a href="Discography.html" class="desktop-icon">' +
                '<img src="' + asset('images/gif/Disc.gif') + '" alt="Discography"><span>Discography</span>' +
            '</a>' +
            '<a href="Plugin.html" class="desktop-icon">' +
                '<img src="' + asset('images/gif/Plugin.png') + '" alt="Plugin"><span>Plugin</span>' +
            '</a>' +
            '<a href="https://www.youtube.com/playlist?list=PLaOBQu1YWaALTPxFLYkV7YeZQMcRz8wqo" target="_blank" rel="noopener noreferrer" class="desktop-icon">' +
                '<img src="' + asset('images/gif/Earth.gif') + '" alt="Works"><span>Works</span>' +
            '</a>' +
            '<a href="Contact.html" class="desktop-icon">' +
                '<img src="' + asset('images/gif/window.gif') + '" alt="Contact"><span>Contact</span>' +
            '</a>' +
            '<a href="freebgm.html" class="desktop-icon">' +
                '<img src="' + asset('images/gif/Sound.gif') + '" alt="FREEBGM"><span>FREEBGM</span>' +
            '</a>';
    }

    function injectSharedUI() {
        if (document.getElementById('win95-taskbar')) return;

        var host = document.createElement('div');
        host.id = 'common-ui-root';
        host.innerHTML =
            '<div class="window" id="win-cat-warning" style="z-index:40000;">' +
                '<div class="title-bar draggable-cursor" id="handle-cat-warning">' +
                    '<span>Warning</span>' +
                    '<div class="title-bar-controls">' +
                        '<button type="button" class="close-button" aria-label="Close">×</button>' +
                    '</div>' +
                '</div>' +
                '<div class="window-contents">' +
                    '<div class="warning-content">' +
                        '<div class="warning-error-icon" aria-hidden="true">×</div>' +
                        '<p class="warning-message">Warning: Too many cats detected.</p>' +
                    '</div>' +
                    '<div class="warning-actions">' +
                        '<button type="button" id="cat-warning-ok" class="warning-ok-button">OK</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="window" id="win-nyan-special" style="width:480px;z-index:20000;display:none;">' +
                '<div class="title-bar draggable-cursor" id="handle-nyan-special">' +
                    '<span>Nyan_Cat.txt</span>' +
                    '<div class="title-bar-controls">' +
                        '<button type="button" class="window-control-button minimize-button" aria-label="Minimize">_</button>' +
                        '<button type="button" class="window-control-button maximize-button" aria-label="Maximize">□</button>' +
                        '<button type="button" class="close-button" aria-label="Close">×</button>' +
                    '</div>' +
                '</div>' +
                '<div class="window-contents" style="background-color:#fff;padding:10px;text-align:center;">' +
                    '<img src="' + asset('images/NyanCatAA.png') + '" alt="Nyan Cat Art" style="width:100%;height:auto;display:block;margin:0 auto;">' +
                    '<p style="color:#000;font-size:10px;text-align:center;margin-top:10px;">NYAN !! NYAN !! NYAN !! NYAN !! NYAN !! NYAN !! NYAN !! NYAN !! NYAN !! NYAN !!</p>' +
                '</div>' +
            '</div>' +

            '<img id="nyan-cat" src="' + asset('images/gif/Nyancat.gif') + '" alt="Nyan Cat" ' +
                 'style="position:fixed;width:80px;height:auto;z-index:25000;cursor:pointer;display:block;image-rendering:pixelated;top:50%;left:50%;">' +

            '<div id="start-menu" aria-hidden="true">' +
                '<div class="start-menu-rail"><span>Kaichi 95</span></div>' +
                '<div class="start-menu-items">' +
                    '<button type="button" id="shutdown-menu-item" class="start-menu-item">' +
                        '<img src="' + asset('images/gif/Computer.gif') + '" alt="">' +
                        '<span>Shut Down...</span>' +
                    '</button>' +
                '</div>' +
            '</div>' +

            '<div id="win95-taskbar">' +
                '<button id="taskbar-start-btn" class="win95-taskbar-btn click-target">' +
                    '<img src="' + asset('images/start.png') + '" alt="Start">' +
                '</button>' +
                '<div id="taskbar-tasks" aria-label="Open windows"></div>' +
                '<div id="taskbar-tray">' +
                    '<img src="' + asset('images/volume-icon.png') + '" alt="Volume" width="15" height="15">' +
                    '<div id="tray-clock">00:00</div>' +
                '</div>' +
            '</div>' +

            '<div id="shutdown-screen" aria-hidden="true">' +
                '<div class="shutdown-title">Kaichi OS</div>' +
                '<pre id="shutdown-output"></pre>' +
            '</div>' +

            '<div id="crt-glitch-layer" aria-hidden="true">' +
                '<div class="crt-glitch-strip"></div>' +
                '<div class="crt-glitch-strip"></div>' +
                '<div class="crt-glitch-strip"></div>' +
            '</div>' +

            '<div id="crt-overlay" aria-hidden="true"></div>' +
            '<div class="footer">このサイトは本人によって頑張って作成されました</div>';

        document.body.appendChild(host);
    }

    function injectGoatCounter() {
        if (document.querySelector('script[data-goatcounter]')) return;
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://gc.zgo.at/count.js';
        s.setAttribute('data-goatcounter', 'https://kaichi.goatcounter.com/count');
        document.body.appendChild(s);
    }

    function getWindowTitle(win) {
        var title = win.querySelector('.title-bar > span');
        return title ? title.textContent.trim() : win.id;
    }

    function ensureTaskbarTab(win) {
        if (!taskbarTasks || !win || win.dataset.closed === 'true') return null;
        if (win.id === 'win-cat-warning') return null;

        var tabs = taskbarTasks.querySelectorAll('.win95-taskbar-tab');
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].dataset.windowId === win.id) return tabs[i];
        }

        var tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'win95-taskbar-tab';
        tab.dataset.windowId = win.id;
        tab.textContent = getWindowTitle(win);
        tab.title = getWindowTitle(win);

        tab.addEventListener('click', function () {
            playClickSound();
            var target = document.getElementById(this.dataset.windowId);
            if (!target) return;

            var visible = target.style.display !== 'none' && target.dataset.minimized !== 'true';
            if (visible && activeWindowId === target.id) {
                minimizeWindow(target);
            } else {
                restoreWindow(target);
                focusWindow(target);
            }
        });

        taskbarTasks.appendChild(tab);
        return tab;
    }

    function removeTaskbarTab(win) {
        if (!taskbarTasks || !win) return;
        var tabs = taskbarTasks.querySelectorAll('.win95-taskbar-tab');
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].dataset.windowId === win.id) {
                tabs[i].remove();
                break;
            }
        }
        if (activeWindowId === win.id) activeWindowId = null;
        refreshTaskbarActiveState();
    }

    function refreshTaskbarActiveState() {
        if (!taskbarTasks) return;
        var tabs = taskbarTasks.querySelectorAll('.win95-taskbar-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].dataset.windowId === activeWindowId);
        }
    }

    function focusWindow(win) {
        if (!win || win.dataset.closed === 'true') return;
        if (win.dataset.minimized === 'true') restoreWindow(win);

        highestZIndex++;
        win.style.zIndex = win.id === 'win-cat-warning' ? '40000' : String(highestZIndex);
        activeWindowId = win.id;
        ensureTaskbarTab(win);
        refreshTaskbarActiveState();
    }

    function minimizeWindow(win) {
        if (!win || win.dataset.closed === 'true') return;
        ensureTaskbarTab(win);
        win.dataset.minimized = 'true';
        win.style.display = 'none';
        if (activeWindowId === win.id) activeWindowId = null;
        refreshTaskbarActiveState();
    }

    function restoreWindow(win) {
        if (!win || win.dataset.closed === 'true') return;
        win.dataset.minimized = 'false';
        win.style.display = win.dataset.windowDisplay || 'inline-block';
        ensureTaskbarTab(win);
    }

    function showWindow(win) {
        if (!win) return;
        win.dataset.closed = 'false';
        win.dataset.minimized = 'false';
        win.style.display = win.dataset.windowDisplay || 'inline-block';
        ensureTaskbarTab(win);
        focusWindow(win);
    }

    function closeWindow(win) {
        if (!win) return;
        win.dataset.closed = 'true';
        win.dataset.minimized = 'false';
        win.style.display = 'none';
        removeTaskbarTab(win);

        if (typeof window.onKaichiWindowClosed === 'function') {
            window.onKaichiWindowClosed(win);
        }
    }

    function centerWindow(win) {
        if (!win) return;
        win.style.transform = 'none';
        requestAnimationFrame(function () {
            win.style.left = Math.max(6, (window.innerWidth - win.offsetWidth) / 2) + 'px';
            win.style.top = Math.max(12, (window.innerHeight - win.offsetHeight - 36) / 2) + 'px';
        });
    }

    function toggleMaximizeWindow(win) {
        if (!win || win.dataset.closed === 'true') return;

        if (win.classList.contains('maximized-window')) {
            var restore = win._restoreState || {};
            win.classList.remove('maximized-window');
            win.style.position = restore.position || 'absolute';
            win.style.left = restore.left || '';
            win.style.top = restore.top || '';
            win.style.width = restore.width || '';
            win.style.height = restore.height || '';
            win.style.maxWidth = restore.maxWidth || '';
            win.style.transform = restore.transform || '';
        } else {
            win._restoreState = {
                position: win.style.position,
                left: win.style.left,
                top: win.style.top,
                width: win.style.width,
                height: win.style.height,
                maxWidth: win.style.maxWidth,
                transform: win.style.transform
            };
            win.classList.add('maximized-window');
        }

        focusWindow(win);
    }

    function initDrag(targetId, handleId) {
        var target = document.getElementById(targetId);
        var handle = document.getElementById(handleId);
        if (!target || !handle || target.dataset.dragReady === 'true') return;

        target.dataset.dragReady = 'true';
        var isDragging = false;
        var initialX, initialY;

        handle.addEventListener('mousedown', startDragging);
        handle.addEventListener('touchstart', startDragging, { passive: false });

        function startDragging(e) {
            if (e.target.closest('.title-bar-controls')) return;
            if (target.classList.contains('maximized-window')) return;

            isDragging = true;
            focusWindow(target);

            var clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
            var clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

            initialX = clientX - target.offsetLeft;
            initialY = clientY - target.offsetTop;

            if (e.type === 'touchstart') e.preventDefault();

            document.addEventListener('mousemove', dragging);
            document.addEventListener('touchmove', dragging, { passive: false });
            document.addEventListener('mouseup', endDrag);
            document.addEventListener('touchend', endDrag);
        }

        function dragging(e) {
            if (!isDragging) return;
            var cx = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            var cy = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

            target.style.left = (cx - initialX) + 'px';
            target.style.top = (cy - initialY) + 'px';

            if (e.type === 'touchmove') e.preventDefault();
        }

        function endDrag() {
            isDragging = false;
            document.removeEventListener('mousemove', dragging);
            document.removeEventListener('touchmove', dragging);
            document.removeEventListener('mouseup', endDrag);
            document.removeEventListener('touchend', endDrag);
        }
    }

    function initWindows() {
        taskbarTasks = document.getElementById('taskbar-tasks');

        var windows = document.querySelectorAll('.window');
        for (var i = 0; i < windows.length; i++) {
            var win = windows[i];

            if (!win.dataset.windowDisplay) win.dataset.windowDisplay = 'inline-block';
            if (!win.dataset.minimized) win.dataset.minimized = 'false';
            if (!win.dataset.closed) win.dataset.closed = 'false';

            var handle = win.querySelector('.title-bar');
            if (handle && handle.id) initDrag(win.id, handle.id);

            if (getComputedStyle(win).display !== 'none') ensureTaskbarTab(win);

            if (win.dataset.managerReady !== 'true') {
                win.dataset.managerReady = 'true';
                win.addEventListener('mousedown', function (e) {
                    if (!e.target.closest('.title-bar-controls')) focusWindow(this);
                });
                win.addEventListener('touchstart', function (e) {
                    if (!e.target.closest('.title-bar-controls')) focusWindow(this);
                }, { passive: true });
            }
        }

        if (!document.body.dataset.windowButtonsReady) {
            document.body.dataset.windowButtonsReady = 'true';
            document.addEventListener('click', function (e) {
                var minBtn = e.target.closest('.minimize-button');
                if (minBtn) {
                    e.stopPropagation();
                    playClickSound();
                    minimizeWindow(minBtn.closest('.window'));
                    return;
                }

                var maxBtn = e.target.closest('.maximize-button');
                if (maxBtn) {
                    e.stopPropagation();
                    playClickSound();
                    toggleMaximizeWindow(maxBtn.closest('.window'));
                    return;
                }

                var closeBtn = e.target.closest('.close-button');
                if (closeBtn) {
                    e.stopPropagation();
                    playClickSound();
                    closeWindow(closeBtn.closest('.window'));
                }
            });
        }
    }

    function setStartMenuOpen(open) {
        var startMenu = document.getElementById('start-menu');
        var startButton = document.getElementById('taskbar-start-btn');
        if (!startMenu || !startButton) return;

        startMenu.classList.toggle('open', open);
        startMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
        startButton.classList.toggle('start-open', open);
    }

    function initStartMenu() {
        var startButton = document.getElementById('taskbar-start-btn');
        var startMenu = document.getElementById('start-menu');
        var shutdownMenuItem = document.getElementById('shutdown-menu-item');

        if (startButton && startMenu) {
            startButton.addEventListener('click', function (e) {
                e.stopPropagation();
                setStartMenuOpen(!startMenu.classList.contains('open'));
            });

            document.addEventListener('mousedown', function (e) {
                if (!startMenu.classList.contains('open')) return;
                if (!startMenu.contains(e.target) && !startButton.contains(e.target)) {
                    setStartMenuOpen(false);
                }
            });
        }

        if (shutdownMenuItem) {
            shutdownMenuItem.addEventListener('click', function () {
                playClickSound();
                beginFakeShutdown();
            });
        }
    }

    function randomHex(length) {
        var chars = '0123456789ABCDEF';
        var out = '';
        for (var i = 0; i < length; i++) {
            out += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return out;
    }

    function beginFakeShutdown() {
        var screen = document.getElementById('shutdown-screen');
        var output = document.getElementById('shutdown-output');
        if (!screen || !output) return;

        play(shutdownSound);
        setStartMenuOpen(false);

        screen.classList.add('active');
        screen.setAttribute('aria-hidden', 'false');
        output.textContent = '';
        document.body.style.overflow = 'hidden';

        var fixedLines = [
            'A problem has been detected and Kaichi OS is shutting down.',
            '',
            'Preparing system restart...',
            'Saving desktop state... OK',
            'Stopping Media_Player.avi... OK',
            'Stopping CD_Player.exe... OK',
            'Closing Social_Media.lnk... OK',
            'Terminating cat.exe processes...',
            ''
        ];

        var lineIndex = 0;
        var dumpIndex = 0;

        function appendLine(line) {
            output.textContent += line + '\n';
            screen.scrollTop = screen.scrollHeight;
        }

        var lineTimer = setInterval(function () {
            if (lineIndex < fixedLines.length) {
                appendLine(fixedLines[lineIndex++]);
                return;
            }

            dumpIndex++;
            appendLine(
                '[' + String(dumpIndex).padStart(3, '0') + '] ' +
                '0x' + randomHex(8) + '  ' +
                randomHex(16) + '  ' +
                (dumpIndex % 4 === 0 ? 'OK' : 'FLUSH')
            );

            if (dumpIndex >= 42) {
                clearInterval(lineTimer);
                appendLine('');
                appendLine('System restart initialized.');
                appendLine('Returning to Kaichi Guitar Music...');
            }
        }, 75);

        setTimeout(function () {
            try {
                sessionStorage.setItem('kaichi-play-startup-sound', '1');
            } catch (e) {}
            window.location.href = 'index.html';
        }, 6000);
    }

    function playStartupSoundAfterReboot() {
        var shouldPlay = false;
        try {
            shouldPlay = sessionStorage.getItem('kaichi-play-startup-sound') === '1';
            if (shouldPlay) sessionStorage.removeItem('kaichi-play-startup-sound');
        } catch (e) {}

        if (!shouldPlay || !startupSound) return;

        try {
            startupSound.currentTime = 0;
            var p = startupSound.play();
            if (p && typeof p.catch === 'function') {
                p.catch(function () {
                    var retry = function () {
                        play(startupSound);
                        document.removeEventListener('pointerdown', retry);
                        document.removeEventListener('keydown', retry);
                    };
                    document.addEventListener('pointerdown', retry, { once: true });
                    document.addEventListener('keydown', retry, { once: true });
                });
            }
        } catch (e) {}
    }


    function triggerCatCrashShutdown() {
        if (catCrashTriggered) return;
        catCrashTriggered = true;

        // Play the dedicated x30 SE at the exact start of the rush.
        // This is called synchronously from the user's 30th cat click.
        if (catCrashSound) {
            try {
                catCrashSound.currentTime = 0;
                var crashPlay = catCrashSound.play();
                if (crashPlay && typeof crashPlay.catch === 'function') {
                    crashPlay.catch(function () {
                        // Fallback: create a fresh audio element if the preloaded instance was blocked/stale.
                        try {
                            var fallbackCrashSound = new Audio(asset('Sound/Nyancat_x30.mp3'));
                            fallbackCrashSound.volume = 1;
                            fallbackCrashSound.play().catch(function(){});
                        } catch (e) {}
                    });
                }
            } catch (e) {
                try {
                    var fallbackCrashSound2 = new Audio(asset('Sound/Nyancat_x30.mp3'));
                    fallbackCrashSound2.volume = 1;
                    fallbackCrashSound2.play().catch(function(){});
                } catch (e2) {}
            }
        }

        var crashCat = document.createElement('img');
        crashCat.id = 'nyan-cat-crash';
        crashCat.src = asset('images/gif/Nyancat.gif');
        crashCat.alt = '';
        crashCat.setAttribute('aria-hidden', 'true');
        document.body.appendChild(crashCat);

        // Force initial style to render before starting the animation.
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                crashCat.classList.add('nyan-cat-crash-go');
            });
        });

        // Same crash timing on desktop and mobile.
        var impactDelay = 1350;
        var shutdownDelay = 1550;

        // "Impact" just before the blue screen.
        setTimeout(function () {
            crashCat.classList.add('nyan-cat-crash-impact');
        }, impactDelay);

        // Cat hits the screen -> immediate shutdown sequence.
        setTimeout(function () {
            beginFakeShutdown();
        }, shutdownDelay);
    }

    function setupCat(catElement, startX, startY, startVx, startVy) {
        var catObj = { element: catElement, x: startX, y: startY, vx: startVx, vy: startVy };
        cats.push(catObj);

        if (cats.length === 10) {
            var special = document.getElementById('win-nyan-special');
            showWindow(special);
            centerWindow(special);
        }

        if (cats.length === 20 && !catWarningTriggered) {
            catWarningTriggered = true;
            var warning = document.getElementById('win-cat-warning');
            showWindow(warning);
            centerWindow(warning);
            warning.style.zIndex = '40000';
            play(catErrorSound);
        }

        if (cats.length === 30 && !catCrashTriggered) {
            triggerCatCrashShutdown();
        }

        function catchCat(e) {
            e.preventDefault();
            play(catSound);

            catObj.vx = (Math.random() * 4 + 2) * (Math.random() < 0.5 ? 1 : -1);
            catObj.vy = (Math.random() * 3 + 1) * (Math.random() < 0.5 ? 1 : -1);

            var newCat = document.createElement('img');
            newCat.src = asset('images/gif/Nyancat.gif');
            newCat.style.position = 'fixed';
            newCat.style.width = '80px';
            newCat.style.zIndex = '25000';
            newCat.style.cursor = 'pointer';
            newCat.style.imageRendering = 'pixelated';
            newCat.style.left = catObj.x + 'px';
            newCat.style.top = catObj.y + 'px';
            document.body.appendChild(newCat);

            setupCat(
                newCat,
                catObj.x,
                catObj.y,
                (Math.random() * 4 + 2) * (Math.random() < 0.5 ? 1 : -1),
                (Math.random() * 3 + 1) * (Math.random() < 0.5 ? 1 : -1)
            );
        }

        catElement.addEventListener('mousedown', catchCat);
        catElement.addEventListener('touchstart', catchCat, { passive: false });
    }

    function initCats() {
        var originalCat = document.getElementById('nyan-cat');
        if (originalCat) {
            setupCat(originalCat, window.innerWidth / 2, window.innerHeight / 2, 3, 2);
        }

        var warningOk = document.getElementById('cat-warning-ok');
        if (warningOk) {
            warningOk.addEventListener('click', function () {
                playClickSound();
                closeWindow(document.getElementById('win-cat-warning'));
            });
        }

        requestAnimationFrame(animateCats);
    }

    function animateCats() {
        var w = window.innerWidth;
        var h = window.innerHeight;

        for (var i = 0; i < cats.length; i++) {
            var cat = cats[i];
            cat.x += cat.vx;
            cat.y += cat.vy;

            if (cat.x + 80 > w) {
                cat.x = w - 80;
                cat.vx *= -1;
                cat.element.style.transform = 'scaleX(-1)';
            } else if (cat.x < 0) {
                cat.x = 0;
                cat.vx *= -1;
                cat.element.style.transform = 'scaleX(1)';
            }

            if (cat.y + 50 > h) {
                cat.y = h - 50;
                cat.vy *= -1;
            } else if (cat.y < 0) {
                cat.y = 0;
                cat.vy *= -1;
            }

            cat.element.style.left = cat.x + 'px';
            cat.element.style.top = cat.y + 'px';
        }

        requestAnimationFrame(animateCats);
    }

    function initClickSounds() {
        document.addEventListener('mousedown', function (e) {
            if (e.target.closest('.desktop-icon, .win95-btn, .window-control-button, .close-button, .title-bar, .phalux-link, .click-target, .warning-ok-button, .win95-calc-btn')) {
                playClickSound();
            }
        });
    }

    function initCrtGlitch() {
        var strips = document.querySelectorAll('.crt-glitch-strip');
        if (!strips.length) return;

        var reducedMotion = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducedMotion) return;

        function triggerGlitch() {
            if (Math.random() < 0.86) {
                var strip = strips[Math.floor(Math.random() * strips.length)];
                var top = 5 + Math.random() * 90;
                var height = 1 + Math.random() * 5;
                var shift = (Math.random() - 0.5) * 6.0;

                strip.style.top = top + '%';
                strip.style.height = height + 'px';
                strip.style.transform = 'translateX(' + shift.toFixed(2) + 'px)';
                strip.classList.add('visible');

                setTimeout(function () {
                    strip.classList.remove('visible');
                    strip.style.transform = 'translateX(0)';
                }, 55 + Math.random() * 105);
            }

            setTimeout(triggerGlitch, 520 + Math.random() * 1500);
        }

        setTimeout(triggerGlitch, 900 + Math.random() * 1200);
    }

    function updateTrayClock() {
        var clock = document.getElementById('tray-clock');
        if (!clock) return;
        var now = new Date();
        var h = now.getHours();
        var m = now.getMinutes();
        clock.textContent = (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
    }

    function runPageLayout() {
        if (typeof window.setInitialPositions === 'function') {
            setTimeout(window.setInitialPositions, 100);
        }
    }

    function init() {
        injectNavigation();
        injectSharedUI();
        injectGoatCounter();

        taskbarTasks = document.getElementById('taskbar-tasks');

        initClickSounds();
        initWindows();
        initStartMenu();
        initCats();
        initCrtGlitch();
        playStartupSoundAfterReboot();

        updateTrayClock();
        setInterval(updateTrayClock, 60000);

        window.KaichiUI = {
            asset: asset,
            playClickSound: playClickSound,
            initDrag: initDrag,
            focusWindow: focusWindow,
            minimizeWindow: minimizeWindow,
            restoreWindow: restoreWindow,
            showWindow: showWindow,
            closeWindow: closeWindow,
            centerWindow: centerWindow,
            toggleMaximizeWindow: toggleMaximizeWindow,
            refreshWindows: initWindows,
            runPageLayout: runPageLayout,
            errorSound: catErrorSound
        };

        runPageLayout();
        window.addEventListener('resize', runPageLayout);
        window.addEventListener('load', runPageLayout);

        document.dispatchEvent(new CustomEvent('kaichi-ui-ready'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
