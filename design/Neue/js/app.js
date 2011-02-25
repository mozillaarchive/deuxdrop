
String.prototype.wordWrap = function(m, b, c){
    var i, j, s, r = this.split("\n");
    if(m > 0) for(i in r){
        for(s = r[i], r[i] = ""; s.length > m;
            j = c ? m : (j = s.substr(0, m).match(/\S*$/)).input.length - j[0].length
            || m,
            r[i] += s.substr(0, j) + ((s = s.substr(j)).length ? b : "")
        );
        r[i] += s;
    }
    return r.join("\n");
};

function quoted_printable_decode (str) {
    // http://kevin.vanzonneveld.net
    // +   original by: Ole Vrijenhoek
    // +   bugfixed by: Brett Zamir (http://brett-zamir.me)
    // +   reimplemented by: Theriault
    // +   improved by: Brett Zamir (http://brett-zamir.me)
    // +   bugfixed by: Theriault
    // *     example 1: quoted_printable_decode('a=3Db=3Dc');
    // *     returns 1: 'a=b=c'
    // *     example 2: quoted_printable_decode('abc  =20\r\n123  =20\r\n');
    // *     returns 2: 'abc   \r\n123   \r\n'
    // *     example 3: quoted_printable_decode('012345678901234567890123456789012345678901234567890123456789012345678901234=\r\n56789');
    // *     returns 3: '01234567890123456789012345678901234567890123456789012345678901234567890123456789'
    // *    example 4: quoted_printable_decode("Lorem ipsum dolor sit amet=23, consectetur adipisicing elit");
    // *    returns 4: Lorem ipsum dolor sit amet#, consectetur adipisicing elit
    // Removes softline breaks
    var RFC2045Decode1 = /=\r\n/gm,
        // Decodes all equal signs followed by two hex digits
        RFC2045Decode2IN = /=([0-9A-F]{2})/gim,
        // the RFC states against decoding lower case encodings, but following apparent PHP behavior
        // RFC2045Decode2IN = /=([0-9A-F]{2})/gm,
        RFC2045Decode2OUT = function (sMatch, sHex) {
            return String.fromCharCode(parseInt(sHex, 16));
        };
    return str.replace(RFC2045Decode1, '').replace(RFC2045Decode2IN, RFC2045Decode2OUT);
}


function assert(test, msg) {
    if (test !== true) throw msg;
}

var mail = {
    getFolders: function(ok) {
        $.ajax({
            url: "/api/folder",
            context: $('#folderList'),
            success: function(data, textStatus, jqXHR) {
                //dump(JSON.stringify(data));
                $(this).empty();
                $.each(data.result, function(i) {
                   var m = /^\{.+\}(.*)$/.exec(data.result[i]);
                   if (m) {
                    $("#tmplBoxList")
                        .tmpl( {'id': m[1],'name': m[1]} )
                        .appendTo("#folderList");  
                   }
                });
                $("#folderList > li").click(function(e) {
                   // switch to the front, loading the queried folder
                    $("#primaryNav").addClass('messages');
        $("#secondaryNav li.inbox").addClass('selected');
        $("#secondaryNav li.inbox").siblings().removeClass('selected');
                    mail.showFolder($(this).attr('id'));
                });
                if (ok) {
                    ok();
                }
            },
            error: function(jqXHR, errorStr, ex) {
                dump("failed getting folders "+ex+"\n");
            }
        });
    },
    showFolder: function(folder) {
        $('#msgList').empty();
        $('#folderName').text(folder);
        $.ajax({
            url: "/api/folder/"+folder,
            context: $('#msgList'),
            type: "POST",
            data: {
                folder: folder
            },
            success: function(data, textStatus, jqXHR) {
                //dump(JSON.stringify(data)+"\n");
                var e = data.result.entries;
                $.each(e, function(i) {
                    //dump(JSON.stringify(e[i])+"\n\n");
                    var msg = e[i];
                    msg.date = $.prettyDate.format(msg.date);
                    dump("date is "+JSON.stringify(e[i])+"\n");
                    $("#tmplHeaderList")
                        .tmpl( msg )
                        .appendTo("#msgList");  
                });
                $(".messagePrev").click(function(e) {
                   // switch to the front, loading the queried folder
                   $(this).toggleClass("selected");
                   $(this).siblings().removeClass('selected');
                   mail.showMessage($(this).attr('id'));
                });
            }
        });
    },
    processMessage: function(msg) {
        // select the primary part that will be shown as the message body
        if (!msg.parts)
            return msg;
        msg.body = msg.parts[0].body;
        msg.type = msg.parts[0].subtype;
        for (var p in msg.parts) {
            var part = msg.parts[p];
            if (part.subtype == "ALTERNATIVE") {
                // which subpart to show?
                var subparts = part.parts;
                for (var i in subparts) {
                    if (/*subparts[i].subtype == "HTML" ||*/
                        subparts[i].subtype == "PLAIN") {
                        msg.type = subparts[i].subtype;
                        msg.body = subparts[i].body;
                    }
                }
            } else
            if (/*part.subtype == "HTML" ||*/
                part.subtype == "PLAIN") {
                msg.type = part.subtype;
                msg.body = part.body;
            }
        }
        msg.body = quoted_printable_decode(msg.body);
        return msg;
    },
    showMessage: function(id) {
        //alert(id);
        $('#messageContent').empty();
        //$(".messagePrev.active").toggleClass("selected");
        $("body").addClass("conversationView");
        $.ajax({
            url: "/api/message/"+id,
            type: "POST",
            data: {
                id: id
            },
            context: $('#msgList'),
            success: function(data, textStatus, jqXHR) {
                var msg = mail.processMessage(data.result);
                //dump(JSON.stringify(msg)+"\n\n");
                $("#tmplMessage")
                    .tmpl( msg )
                    .appendTo("#messageContent");
                if (msg.type === "HTML")
                    $('#bodyFrame').ready(function() {
                        $('#bodyFrame').contents().find('html').html(msg.body);
                    });
            }
        });
    }
}