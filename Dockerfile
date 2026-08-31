FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY index.html app.js styles.css server.mjs collector.mjs README.md ./
COPY data/projects.json ./data/projects.json

ENV HOST=0.0.0.0
ENV PUBLIC_DEPLOYMENT=true
ENV DATA_DIR=/var/data

EXPOSE 4173
CMD ["npm", "run", "start"]
