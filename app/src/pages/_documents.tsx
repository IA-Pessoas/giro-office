import Document, { Html, Head, Main, NextScript } from "next/document";

export default class Mydocument extends Document {
    render(): JSX.Element {
        return(
            <Html lang="pt-BR">
                <Head />
                <body>
                    <script
                      dangerouslySetInnerHTML={{
                        __html: "(function(){try{var m=localStorage.getItem('chakra-ui-color-mode');document.documentElement.setAttribute('data-theme',m==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();",
                      }}
                    />
                    <Main/>
                    <NextScript/>
                </body>
            </Html>
        )
    }
}