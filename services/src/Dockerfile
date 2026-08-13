# Usa imagem base com Debian 11 (bullseye), que ainda possui libssl1.1
FROM node:18-bullseye

# Instala dependências do sistema, incluindo libssl1.1 e bibliotecas do Chrome headless
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

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependência para instalar pacotes
COPY package*.json ./

# Instala as dependências do projeto
RUN npm install --ignore-scripts

# Copia o restante do código-fonte da aplicação
COPY . .

# Gera os arquivos do cliente Prisma
RUN npx prisma generate

# Compila os arquivos TypeScript
RUN npm run build

# Expõe a porta 3000 (ou a que seu servidor usa)
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["node", "dist/server.js"]
