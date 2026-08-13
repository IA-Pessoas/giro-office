# Usa imagem base com Debian 11 (bullseye), que ainda possui libssl1.1
FROM node:18-bullseye

# Instala depend?ncias do sistema, incluindo libssl1.1 e bibliotecas do Chrome headless
RUN apt-get update && \
    apt-get install -y \
    openssl \
    libssl1.1 \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Define o diret?rio de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de depend?ncia para instalar pacotes
COPY package*.json ./

# Instala as depend?ncias do projeto
RUN npm install --ignore-scripts

# Copia o restante do c?digo-fonte da aplica??o
COPY . .

# Gera os arquivos do cliente Prisma
RUN npx prisma generate

# Compila os arquivos TypeScript
RUN npm run build

# Exp?e a porta 3000 (ou a que seu servidor usa)
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["node", "dist/server.js"]
