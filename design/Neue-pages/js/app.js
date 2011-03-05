
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
    settings: function() {
        $('#settings input#fullname').val(localStorage.fullname);
        $('#settings input#email').val(localStorage.email);
        $('#settings input#username').val(localStorage.username);
    },
    labels: function() {
        $.ajax({
            url: "/api/folder",
            type: "POST",
            data: {
                username: localStorage.username,
                password: localStorage.password
            },
            context: $('#folderList'),
            success: function(data, textStatus, jqXHR) {
                //dump(JSON.stringify(data)+"\n");
                $(this).empty();
                $.each(data.result, function(i) {
                   var m = /^\{.+\}(.*)$/.exec(data.result[i]);
                   if (m) {
                    $("#tmplBoxList")
                        .tmpl( {'id': m[1],'name': m[1]} )
                        .appendTo("#folderList");  
                   }
                });
                $("#folderList li").click(function(e) {
                    location.hash = "messages/" + $(this).attr('id');
                    return;
                    
                   // switch to the front, loading the queried folder
                    $("nav li").removeClass('selected');
                    $("nav li.inbox").addClass('selected');
                    $('page').removeClass('selected');
                    $('#messages').addClass('selected');
                    mail.showFolder($(this).attr('id'));
                });
            },
            error: function(jqXHR, errorStr, ex) {
                //dump("failed getting folders ["+jqXHR.responseText+"]\n");
            }
        });
    },
    messages: function(folder) {
        if (typeof(folder) === 'undefined')
            folder = $("#folderList li:first-child").attr('id');
        $('#msgList').empty();
        $('#folderName').text(folder);
        $.ajax({
            url: "/api/folder/"+folder,
            context: $('#msgList'),
            type: "POST",
            data: {
                username: localStorage.username,
                password: localStorage.password,
                folder: folder
            },
            success: function(data, textStatus, jqXHR) {
                //dump("we got: "+JSON.stringify(data)+"\n");
                var e = data.result.entries;
                $.each(e, function(i) {
                    //dump(JSON.stringify(e[i])+"\n\n");
                    var msg = e[i];
                    msg.date = $.prettyDate.format(msg.date);
                    //dump("date is "+JSON.stringify(e[i])+"\n");
                    $("#tmplHeaderList")
                        .tmpl( msg )
                        .appendTo("#msgList");  
                });
                $(".messagePrev").click(function(e) {
                    $(this).toggleClass("selected");
                    $(this).siblings().removeClass('selected');

                    location.hash = '#message/'+$(this).attr('id').trim();
                    return;
                    // switch to the front, loading the queried folder
                    mail.showMessage($(this).attr('id'));
                });
            },
            error: function(jqXHR, errorStr, ex) {
                //dump("failed getting message ["+jqXHR.statusText+"]\n");
            }
        });
    },
    processMessage: function(msg) {
        // select the primary part that will be shown as the message body
        if (!msg || !msg.parts)
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
    message: function(id) {
        //alert(id);
        $('#messageContent').empty();
        //$(".messagePrev.active").toggleClass("selected");
        $('page.secondary').removeClass('selected');
        $('body').addClass('secondary');
        $('#conversation').addClass('selected');
        
        $.ajax({
            url: "/api/message/"+id,
            type: "POST",
            data: {
                username: localStorage.username,
                password: localStorage.password,
                id: id
            },
            context: $('#msgList'),
            success: function(data, textStatus, jqXHR) {
                //dump(JSON.stringify(data)+"\n\n");
                var msg = mail.processMessage(data.result);
                //dump(JSON.stringify(msg)+"\n\n");
                $("#tmplMessage")
                    .tmpl( msg )
                    .appendTo("#messageContent");
                if (msg.type === "HTML")
                    $('#bodyFrame').ready(function() {
                        $('#bodyFrame').contents().find('html').html(msg.body);
                    });
            },
            error: function(jqXHR, errorStr, ex) {
                //dump("failed getting folders "+ex+"\n");
            }
        });
    },
    send: function(data) {
        data['username'] = localStorage.username;
        data['password'] = localStorage.password;
        data['fullname'] = localStorage.fullname;
        data['email'] = localStorage.email;
        $.ajax({
            url: "/api/send",
            type: "POST",
            data: data,
            context: $('#msgList'),
            success: function(data, textStatus, jqXHR) {
                //dump(JSON.stringify(data)+"\n\n");
                if (data.result === "ok")
                    history.go(-1)
                else
                    alert(data.error);
            },
            error: function(jqXHR, errorStr, ex) {
                //dump("failed getting folders "+ex+"\n");
            }
        });        
    }
}


