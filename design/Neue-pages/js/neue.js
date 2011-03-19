
// this contains primarily initialization and navigation related code,
// it calls into pages to initialize the display of any page that is
// navigated to

$(document).ready(function($) {

    function goPage(hash) {
        var data = hash.substr(1).split("/");
        var page = data.shift();
        var target = $('#'+page);
        var menu = $("nav li."+page);
        
        // change the menu highlight
        menu.siblings().removeClass('selected');
        menu.addClass('selected');
        
        // change the page
        target.siblings().removeClass('selected');
        target.addClass('selected');
        
        if (target.hasClass('secondary'))
            $('body').addClass('secondary');
        else
            $('body').removeClass('secondary');

        pages.show(page, data);
    }

    // overflow
    $('.overflow').textOverflow('...',true);

    // setup the toolbar links
    $("nav li").click(function() {
        if ($(this).hasClass('back')) {
            history.go(-1);
            return;
        }
        var command = $(this).attr('data-for');
        var target = $('#'+command);
        var type = target.get(0).nodeName;
        
        if (type === "PAGE") {
            location.hash = $(this).attr('data-for');
        } else
        if (type === "TOOLBAR") {
            $(this).toggleClass("on off");
            target.toggleClass('visible');
        }
    });

    // initialize
    pages.init();


    $(window).hashchange( function(){
        goPage( location.hash ? location.hash : '#messages' );
    })
    $(window).hashchange();
    
});

