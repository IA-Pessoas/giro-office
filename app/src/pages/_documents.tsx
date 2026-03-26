import Document, { Html, Head, Main, NextScript } from "next/document";

export default class Mydocument extends Document {
    render(): JSX.Element {
        return(
            <Html lang="pt-BR">
                <Head />
                <body>
                    <script
                      dangerouslySetInnerHTML={{
                        __html:
                          "(function(){try{var w=localStorage.getItem('workspace-theme');var c=localStorage.getItem('chakra-ui-color-mode');var t=(w==='dark'||w==='light')?w:((c==='dark'||c==='light')?c:'light');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();",
                      }}
                    />
                    <Main/>
                    <NextScript/>
                </body>
            </Html>
        )
    }
}