
// remotestore handles the ajax calls to a remote message store.  the remote
// api should be relatively stable between different systems, though we could
// abstract this into multiple backend api's.

function quoted_printable_decode (str) {
    if (!str) return str;
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

    labels: function(refresh, ok, err) {
        var account = accounts.current;
        var labels = accounts.get('labels', []);
        if (labels && labels.length > 0 && !refresh) {
            if (ok)
                ok(labels);
            return;
        }

        $.ajax({
            url: "/api/folder",
            type: "POST",
            data: {
                username: account.username,
                password: account.password
            },
            success: function(data, textStatus, jqXHR) {
                dump("data: "+JSON.stringify(data)+"\n");
                accounts.set('labels', data.result);
                if (ok)
                    ok(data.result);
            },
            error: err
        });
    },
    

    messages: function(label, refresh, ok, err) {
        dump("get messages: "+label+"\n");
        var account = accounts.current;
        var messages = accounts.get('messages:'+label, []);
        
        if (messages && messages.length && !refresh) {
            dump("got messages, use them\n");
            if (ok)
                ok(messages);
            // get recent messages now
            //label = label+"/recent"
            return;
        }

        $.ajax({
            url: "/api/folder/"+label,
            type: "POST",
            data: {
                username: account.username,
                password: account.password
            },
            success: function(data, textStatus, jqXHR) {
                //dump("error: "+JSON.stringify(data)+"\n");
                accounts.set('messages:'+label, data.result.entries);
                if (ok)
                    ok(messages);
            },
            error: err
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
    message: function(id, ok, err) {
        
        var account = accounts.current;
        $.ajax({
            url: "/api/message/"+id,
            type: "POST",
            data: {
                username: account.username,
                password: account.password,
                id: id
            },
            success: function(data, textStatus, jqXHR) {
                dump(JSON.stringify(data)+"\n\n");
                var msg = mail.processMessage(data.result);
                if (ok)
                    ok(msg);
            },
            error: err
        });
    },
    send: function(data) {
        $.extend(data, accounts.current);
        $.ajax({
            url: "/api/send",
            type: "POST",
            data: data,
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

