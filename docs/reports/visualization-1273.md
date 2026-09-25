# Visualização gráfica de relatórios (#1273)

A prévia e o resultado salvo permitem alternar entre tabela, barras, linha e setores. A tabela permanece disponível e é a referência para leitura e exportação. O gráfico usa somente as linhas carregadas na página atual; a interface informa quando há mais registros. A configuração visual não é persistida no modelo ou no snapshot.

- A dimensão identifica categorias; a medida deve ser numérica e finita. Série é opcional para barras e linhas, com até cinco valores distintos.
- Barras aceitam categorias textuais. Linha exige dimensão numérica ou data. Setores aceitam até 12 categorias, valores não negativos e total positivo; série não se aplica.
- Cada par dimensão/série deve ter um valor único. O serviço não soma linhas implicitamente para produzir um gráfico. Para dados repetidos, configure um resumo por grupo na composição v3.
- Há limite de 40 pontos carregados por gráfico. Linhas vazias, medidas ausentes, dados incompatíveis e excesso de pontos produzem orientação na tela. Os controles permitem ordem crescente ou decrescente por dimensão ou medida.
- As cores distinguem séries e os rótulos aparecem em legenda e dica; a tabela mantém os valores em texto para leitura por tecnologias assistivas. O gráfico recebe nome acessível.

**Exportação:** CSV, XLSX e PDF continuam exportando os dados tabulares do snapshot, sem embutir o gráfico. Essa decisão evita apresentar um recorte visual da página como se representasse todo o relatório. A ordem e a seleção de campos do relatório são as da composição salva; a ordem escolhida no controle do gráfico só altera a visualização local.

Ao abrir um gráfico, o usuário pode expandir **Ver valores do gráfico** para ler a dimensão e as séries em tabela, inclusive quando a medida escolhida está oculta na tabela principal. Falha de carregamento do componente gráfico apresenta mensagem e mantém a tabela principal. Para listas agrupadas da composição v3, as dimensões ocultas são exportadas como colunas `Grupo: ...` repetidas nas linhas, preservando a identificação do grupo em formatos tabulares.
