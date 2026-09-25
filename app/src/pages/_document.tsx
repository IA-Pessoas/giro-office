import Document, { Html, Head, Main, NextScript } from "next/document";

export default class Mydocument extends Document {
    render(): JSX.Element {
        return(
            <Html lang="pt-BR">
                <Head>
                  <meta charSet="utf-8" />
                </Head>
                <body>
                    <script
                      dangerouslySetInnerHTML={{
                        __html: "(function(){try{var root=document.documentElement;var workspaceTheme=localStorage.getItem('workspace-theme');var legacyTheme=localStorage.getItem('chakra-ui-color-mode');var theme=workspaceTheme==='dark'||workspaceTheme==='light'?workspaceTheme:legacyTheme==='dark'||legacyTheme==='light'?legacyTheme:'light';root.classList.remove('light','dark');root.classList.add(theme);root.setAttribute('data-theme',theme);}catch(e){document.documentElement.classList.remove('light','dark');document.documentElement.classList.add('light');document.documentElement.setAttribute('data-theme','light');}})();",
                      }}
                    />
                    <Main/>
                    <NextScript/>
                </body>
            </Html>
        )
    }
}
