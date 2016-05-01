(function () {
'use strict';

Vue.config.debug = true;

window.Guacamoly = window.Guacamoly || {};
var Core = window.Guacamoly.Core;

var md = window.markdownit({
    breaks: true,
    html: true,
    linkify: true
}).use(window.markdownitEmoji)
.use(window.markdownitCheckbox);

md.renderer.rules.emoji = function(token, idx) {
  return twemoji.parse(token[idx].content);
};

Vue.filter('markdown', function (value) {
    if (!value) return '';

    return md.render(value);
});

Vue.filter('prettyDateOffset', function (time) {
    var date = new Date(time),
        diff = (((new Date()).getTime() - date.getTime()) / 1000),
        day_diff = Math.floor(diff / 86400);

    if (isNaN(day_diff) || day_diff < 0)
        return;

    return day_diff === 0 && (
            diff < 60 && 'just now' ||
            diff < 120 && '1 minute ago' ||
            diff < 3600 && Math.floor( diff / 60 ) + ' minutes ago' ||
            diff < 7200 && '1 hour ago' ||
            diff < 86400 && Math.floor( diff / 3600 ) + ' hours ago') ||
        day_diff === 1 && 'Yesterday' ||
        day_diff < 7 && day_diff + ' days ago' ||
        day_diff < 31 && Math.ceil( day_diff / 7 ) + ' weeks ago' ||
        day_diff < 365 && Math.round( day_diff / 30 ) +  ' months ago' ||
                          Math.round( day_diff / 365 ) + ' years ago';
});

function getCurrentSearchWord() {
    if (!vue) return '';

    var cursorPos = vue.$els.searchinput.selectionStart;
    var search = vue.search;
    var word = '';

    for (var i = 0; i < search.length; ++i) {
        // break if we went beyond and we hit a space
        if (i > cursorPos && search[i] === ' ') break;

        if (search[i] === ' ') word = '';
        else word += search[i];
    }

    return word;
}

Vue.filter('proposeTags', function (options) {
    var word = getCurrentSearchWord().replace(/^#/, '');

    return options.filter(function (o) {
        return (o.name.indexOf(word) >= 0) && (o.name !== word);
    });
});

var vue = new Vue({
    el: '#application',
    data: {
        Core: window.Guacamoly.Core,
        tags: [],
        things: [],
        busyThings: true,
        busyFetchMore: false,
        search: '',
        profile: {},
        settings: {},
        mainView: '',
        thingContent: '',
        thingAttachments: []
    },
    methods: {
        giveAddFocus: function () {
            $('#addTextarea').focus();
        },
        addThing: function () {
            var that = this;

            Core.things.add(this.thingContent, this.thingAttachments, function (error, thing) {
                if (error) return console.error(error);
                that.thingContent = '';
                that.thingAttachments = [];
                that.things.unshift(thing);

                that.refreshTags();
            });
        },
        handleSearchKeyInput: function (element, event) {
            if (event.code === 'Escape') {
                $('#tagsDropdown').hide();
            } else {
                $('#tagsDropdown').show();
                if (event.code === 'ArrowDown' &&  $('.dropdown-tags>.item>a')[0]) $('.dropdown-tags>.item>a')[0].focus();
            }
        },
        showTags: function () {
            $('#tagsDropdown').show();
        },
        hideTags: function () {
            $('#tagsDropdown').hide();
        },
        keyNavigateTags: function (element, tag, event) {
            var tagColumns = 4;
            var index = element.$index;

            switch (event.code) {
                case 'Enter':
                    this.activateProposedTag(tag);
                    return;
                case 'ArrowRight':
                    ++index;
                    break;
                case 'ArrowLeft':
                    --index;
                    break;
                case 'ArrowUp':
                    if (index < tagColumns) {
                        $('#searchBarInput').focus();
                        return;
                    }
                    index -= tagColumns;
                    break;
                case 'ArrowDown':
                    index += tagColumns;
                    break;
                case 'Escape':
                    $('#tagsDropdown').hide();
                    $('#searchBarInput').focus();
                    break;
                default: return;
            }

            if ($('.dropdown-tags>.item>a')[index]) {
                Vue.nextTick(function () { $('.dropdown-tags>.item>a')[index].focus(); });
            }
        },
        activateProposedTag: function (tag) {
            var word = getCurrentSearchWord();

            if (!word) vue.search += '#' + tag.name;
            else vue.search = vue.search.replace(getCurrentSearchWord(), '#' + tag.name);

            if (vue.search === '#' + tag.name) window.location.href = '/#search?#' + tag.name;

            Vue.nextTick(function () { vue.$els.searchinput.focus(); });
        },
        logout: function () {
            Core.session.logout();
        },
        doSearch: function () {
            $('#tagsDropdown').hide();
            window.location.href = '/#search?' + encodeURIComponent(this.search);
        },
        clearSearch: function () {
            this.search = '';
            this.refresh();

            $('#inputSearch').focus();
        },
        exportThings: function () {
            Core.things.export();
        },
        refreshTags: function (callback) {
            var that = this;

            Core.tags.get(function (error, tags) {
                if (error) return console.error(error);

                that.tags = tags;

                if (callback) callback();
            });
        },
        refresh: function (search) {
            var that = this;

            this.busyThings = true;

            window.location.href = '/#search?' + (search ? encodeURIComponent(search) : '');

            Core.things.get(search || '', function (error, data) {
                if (error) return console.error(error);

                that.things = data;
                that.busyThings = false;
            });
        },
        triggerAttachmentUpload: function () {
            $('#addAttachment').click();
        },
        attachmentChanged: function (event) {
            var that = this;
            var data = new FormData();
            data.append('file', event.target.files[0]);

            this.$root.Core.things.uploadFile(data, function (error, result) {
                if (error) console.error(error);

                that.thingContent += ' [' + result.fileName + '] ';
                that.thingAttachments.push(result);
            });
        },
        main: function () {
            var that = this;

            this.mainView = 'loader';

            Core.session.profile(function (error, profile) {
                if (error) return console.error(error);

                that.profile = profile;

                Core.settings.get(function (error, settings) {
                    if (error) return console.error(error);

                    // set initial settings
                    that.settings = settings;
                    if (settings.title) window.document.title = settings.title;
                    if (settings.backgroundUrl) window.document.body.style.backgroundImage = 'url("' + settings.backgroundUrl + '")';

                    that.refreshTags(function () {
                        that.mainView = 'content';

                        window.setTimeout(function () { that.$els.searchinput.focus(); }, 0);

                        hashChangeHandler();

                        // add global object for browser extensions
                        document.getElementById('guacamoly-settings-node').textContent = JSON.stringify({
                            origin: Core.origin(),
                            token: Core.token(),
                            title: settings.title
                        });
                    });
                });
            });
        }
    },
    ready: function () {
        // Register event handlers
        shortcut.add('Ctrl+s', this.addThing.bind(this), { target: 'addTextarea' });
        shortcut.add('Ctrl+Enter', this.addThing.bind(this), { target: 'addTextarea' });

        this.main();
    }
});

function hashChangeHandler() {
    var action = window.location.hash.split('?')[0];
    var params = window.location.hash.indexOf('?') > 0 ? decodeURIComponent(window.location.hash.slice(window.location.hash.indexOf('?') + 1)) : null;

    if (action === '#search') {
        if (params !== null) vue.search = params;
        vue.refresh(vue.search);
    } else {
        window.location.href = '/#search?';
    }
}

function scrollHandler() {
    // add 1 full pixel to be on the safe side for zoom settings, where pixel values might be floats
    if ($(window).height() + $(window).scrollTop() + 1 >= $(document).height()) {
        // prevent from refetching while in progress
        if (vue.busyFetchMore) return;

        vue.busyFetchMore = true;

        Core.things.fetchMore(function (error, result) {
            vue.busyFetchMore = false;

            if (error) return console.error(error);

            vue.things = vue.things.concat(result);
        });
    }
}

function reset() {
    vue.mainView = 'login';
    vue.things = [];
    vue.tags = [];
    vue.search = '';
    vue.settings = {};
}

Core.onAuthFailure = reset;
Core.onLogout = reset;

Core.settings.onChanged(function (data) {
    vue.settings.title = data.title || 'Guacamoly';
    vue.settings.backgroundUrl = data.backgroundUrl;
    vue.settings.wide = data.wide;

    window.document.title = data.title;

    if (data.backgroundUrl) window.document.body.style.backgroundImage = 'url("' + data.backgroundUrl + '")';
});

Core.things.onDeleted(function (thing) {
    // remove if found
    for (var i = 0; i < vue.things.length; ++i) {
        if (vue.things[i].id === thing.id) {
            vue.things.splice(i, 1);
            return;
        }
    }
});

Core.things.onEdited(function (thing) {
    // move to first spot
    vue.things.splice(0, 0, vue.things.splice(vue.things.indexOf(thing), 1)[0]);
});

window.addEventListener('hashchange', hashChangeHandler, false);
window.addEventListener('scroll', scrollHandler, false);

})();
