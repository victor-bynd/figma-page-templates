import '!prismjs/themes/prism.css';
import { Button, Container, render, VerticalSpace } from '@create-figma-plugin/ui';
import { emit } from '@create-figma-plugin/utilities';
import { h } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { highlight, languages } from 'prismjs';
import Editor from 'react-simple-code-editor';
import styles from './styles.css';
function Plugin() {
    var _a = useState("function add(a, b) {\n  return a + b;\n}"), code = _a[0], setCode = _a[1];
    var containerElementRef = useRef(null);
    var handleInsertCodeButtonClick = useCallback(function () {
        emit('INSERT_CODE', code);
    }, [code]);
    // Patch to make `react-simple-code-editor` compatible with Preact
    useEffect(function () {
        var containerElement = containerElementRef.current;
        if (containerElement === null) {
            return;
        }
        var textAreaElement = containerElement.querySelector('textarea');
        if (textAreaElement === null) {
            return;
        }
        textAreaElement.textContent = code;
        var preElement = containerElement.querySelector('pre');
        if (preElement === null) {
            return;
        }
        if (textAreaElement.nextElementSibling !== preElement) {
            textAreaElement.after(preElement);
        }
    }, [code]);
    return (h(Container, { space: "medium" },
        h(VerticalSpace, { space: "small" }),
        h("div", { class: styles.container, ref: containerElementRef },
            h(Editor, { highlight: function (code) {
                    return highlight(code, languages.js, 'js');
                }, onValueChange: setCode, preClassName: styles.editor, textareaClassName: styles.editor, value: code })),
        h(VerticalSpace, { space: "large" }),
        h(Button, { fullWidth: true, onClick: handleInsertCodeButtonClick }, "Insert Code"),
        h(VerticalSpace, { space: "small" })));
}
export default render(Plugin);
