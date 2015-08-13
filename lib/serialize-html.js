var firepad = firepad || { };

/**
 * Helper to turn Firebase contents into HMTL.
 * Takes a doc and an entity manager
 */
firepad.SerializeHtml = (function () {

  var utils      = firepad.utils;
  var ATTR       = firepad.AttributeConstants;
  var LIST_TYPE  = firepad.LineFormatting.LIST_TYPE;
  var TODO_STYLE = '<style>ul.firepad-todo { list-style: none; margin-left: 0; padding-left: 0; } ul.firepad-todo > li { padding-left: 1em; text-indent: -1em; } ul.firepad-todo > li:before { content: "\\2610"; padding-right: 5px; } ul.firepad-todo > li.firepad-checked:before { content: "\\2611"; padding-right: 5px; }</style>\n';

  function open(listTypeOrQuote) {
    switch (listTypeOrQuote) {
      case LIST_TYPE.ORDERED:
        return '<ol>';
        break;
      case LIST_TYPE.UNORDERED:
        return '<ul>';
        break;
      case LIST_TYPE.TODO:
      case LIST_TYPE.TODOCHECKED:
        return '<ul class="firepad-todo">';
        break;
      case ATTR.QUOTE_INDENT:
        return '<blockquote>';
        break;
      default:
        throw new Error('unknown list type "' + listTypeOrQuote + '"');
        break;
    }
  }

  function close(listTypeOrQuote) {
    switch (listTypeOrQuote) {
      case LIST_TYPE.ORDERED:
        return '</ol>';
        break;
      case LIST_TYPE.UNORDERED:
      case LIST_TYPE.TODO:
      case LIST_TYPE.TODOCHECKED:
        return '</ul>';
        break;
      case ATTR.QUOTE_INDENT:
        return '</blockquote>';
        break;
      default:
        throw new Error('unknown list type "' + listTypeOrQuote + '"');
        break;
    }
  }

  function compatibleListType(l1, l2) {
    return (l1 === l2) ||
        (l1 === LIST_TYPE.TODO && l2 === LIST_TYPE.TODOCHECKED) ||
        (l1 === LIST_TYPE.TODOCHECKED && l2 === LIST_TYPE.TODO);
  }

  function textToHtml(text) {
    return text.replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\u00a0/g, '&nbsp;')
  }

  function serializeHtml(doc, entityManager) {
    var html = '';
    var newLine = true;
    var listTypeStack = [];
    var quoteStack = [];
    var inListItem = false;
    var firstLine = true;
    var emptyLine = true;
    var i = 0, op = doc.ops[i];
    var usesTodo = false;
    while(op) {
      utils.assert(op.isInsert());
      var attrs = op.attributes;

      if (newLine) {
        newLine = false;

        var indent = 0, quoteIndent = 0, listType = null, lineAlign = 'left';
        if (ATTR.LINE_SENTINEL in attrs) {
          indent = attrs[ATTR.LINE_INDENT] || 0;
          listType = attrs[ATTR.LIST_TYPE] || null;
          lineAlign = attrs[ATTR.LINE_ALIGN] || 'left';
        }
        if (listType) {
          indent = indent || 1; // lists are automatically indented at least 1.
        }

        if (ATTR.QUOTE_INDENT in attrs) {
          quoteIndent = attrs[ATTR.QUOTE_INDENT] || 1; // quotes are automatically indented at least 1.
        }

        if (inListItem) {
          html += '</li>';
          inListItem = false;
        } else if (!firstLine) {
          if (emptyLine) {
            html += '<br/>';
          }
          html += '</div>';
        }
        firstLine = false;

        // Close any extra lists.
        utils.assert(indent >= 0, "Indent must not be negative.");
        while (listTypeStack.length > indent ||
            (indent === listTypeStack.length && listType !== null && !compatibleListType(listType, listTypeStack[listTypeStack.length - 1]))) {
          html += close(listTypeStack.pop());
        }

        // Close any extra quotes.
        utils.assert(quoteIndent >= 0, "Quote indent must not be negative.");
        while (quoteStack.length > quoteIndent) {
          html += close(quoteStack.pop());
        }

        // Open any needed quotes.
        while (quoteStack.length < quoteIndent) {
          var toOpen = ATTR.QUOTE_INDENT;
          html += open(toOpen);
          quoteStack.push(toOpen);
        }

        // Open any needed lists.
        while (listTypeStack.length < indent) {
          var toOpen = listType || LIST_TYPE.UNORDERED; // default to unordered lists for indenting non-list-item lines.
          usesTodo = listType == LIST_TYPE.TODO || listType == LIST_TYPE.TODOCHECKED || usesTodo;
          html += open(toOpen);
          listTypeStack.push(toOpen);
        }

        var style = (lineAlign !== 'left') ? ' style="text-align:' + lineAlign + '"': '';
        if (listType) {
          var clazz = '';
          switch (listType)
          {
            case LIST_TYPE.TODOCHECKED:
              clazz = ' class="firepad-checked"';
              break;
            case LIST_TYPE.TODO:
              clazz = ' class="firepad-unchecked"';
              break;
          }
          html += "<li" + clazz + style + ">";
          inListItem = true;
        } else {
          // start line div.
          html += '<div' + style + '>';
        }
        emptyLine = true;
      }

      if (ATTR.LINE_SENTINEL in attrs) {
        op = doc.ops[++i];
        continue;
      }

      if (ATTR.ENTITY_SENTINEL in attrs) {
        for(var j = 0; j < op.text.length; j++) {
          var entity = firepad.Entity.fromAttributes(attrs);
          var element = entityManager.exportToElement(entity);
          html += element.outerHTML;
        }

        op = doc.ops[++i];
        continue;
      }

      var prefix = '', suffix = '';
      for(var attr in attrs) {
        var value = attrs[attr];
        var start, end;
        if (attr === ATTR.BOLD || attr === ATTR.ITALIC || attr === ATTR.UNDERLINE || attr === ATTR.STRIKE) {
          utils.assert(value === true);
          start = end = attr;
        } else if (attr === ATTR.FONT_SIZE) {
          start = 'span style="font-size: ' + value;
          start += (typeof value !== "string" || value.indexOf("px", value.length - 2) === -1) ? 'px"' : '"';
          end = 'span';
        } else if (attr === ATTR.FONT) {
          start = 'span style="font-family: ' + value + '"';
          end = 'span';
        } else if (attr === ATTR.COLOR) {
          start = 'span style="color: ' + value + '"';
          end = 'span';
        } else if (attr === ATTR.BACKGROUND_COLOR) {
          start = 'span style="background-color: ' + value + '"';
          end = 'span';
        } else if (attr === ATTR.HREF) {
          start = 'a href="' + value + '"'
          end = 'a'
        }
        else {
          utils.log(false, "Encountered unknown attribute while rendering html: " + attr);
        }
        if (start) prefix += '<' + start + '>';
        if (end) suffix = '</' + end + '>' + suffix;
      }

      var text = op.text;
      var newLineIndex = text.indexOf('\n');
      if (newLineIndex >= 0) {
        newLine = true;
        if (newLineIndex < text.length - 1) {
          // split op.
          op = new firepad.TextOp('insert', text.substr(newLineIndex+1), attrs);
        } else {
          op = doc.ops[++i];
        }
        text = text.substr(0, newLineIndex);
      } else {
        op = doc.ops[++i];
      }

      // Replace leading, trailing, and consecutive spaces with nbsp's to make sure they're preserved.
      text = text.replace(/  +/g, function(str) {
        return new Array(str.length + 1).join('\u00a0');
      }).replace(/^ /, '\u00a0').replace(/ $/, '\u00a0');
      if (text.length > 0) {
        emptyLine = false;
      }

      html += prefix + textToHtml(text) + suffix;
    }

    if (inListItem) {
      html += '</li>';
    } else if (!firstLine) {
      if (emptyLine) {
        html += '&nbsp;';
      }
      html += '</div>';
    }

    // Close any extra lists.
    while (listTypeStack.length > 0) {
      html += close(listTypeStack.pop());
    }

    // Close any extra quotes.
    while (quoteStack.length > 0) {
      html += close(quoteStack.pop());
    }

    if (usesTodo) {
      html = TODO_STYLE + html;
    }

    return html;
  }

  return serializeHtml;
})();
