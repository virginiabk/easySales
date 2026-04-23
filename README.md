# easySales — Guía de despliegue

## Estructura de archivos

```
/
├── server.js          ← servidor Node.js (guarda las credenciales)
├── package.json
├── .env               ← credenciales (NO subir a git)
├── .env.example       ← plantilla del .env
├── .gitignore
└── public/
    └── index.html     ← el HTML de la app (sin credenciales)
```

## Setup inicial

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus datos reales
```

Generar SESSION_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Mover el HTML
```bash
mkdir -p public
mv easySales.html public/index.html
```

### 4. Correr en desarrollo
```bash
npm run dev
# Abrí http://localhost:3000
```

---

## Despliegue en servidor remoto

### Opción A — VPS (Ubuntu/Debian)

```bash
# En el servidor
git clone tu-repo  # o subir los archivos con scp/rsync
cd easySales
npm install --production

# Configurar .env
cp .env.example .env
nano .env  # completar con tus valores reales

# Instalar PM2 para que corra en background
npm install -g pm2
pm2 start server.js --name easySales
pm2 save
pm2 startup  # para que arranque con el sistema

# Ver logs
pm2 logs easySales
```

Con Nginx como reverse proxy:
```nginx
server {
    listen 80;
    server_name tudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Agregar HTTPS con certbot:
```bash
sudo certbot --nginx -d tudominio.com
```

### Opción B — Railway / Render / Fly.io

Estos servicios leen variables de entorno desde su panel (no necesitás subir el .env).

1. Subir el código a GitHub (sin el .env — está en .gitignore)
2. Crear nuevo proyecto en Railway/Render
3. Conectar el repo
4. En el panel de variables de entorno, agregar:
   - `APP_PASSWORD`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `SESSION_SECRET`
5. Deploy automático

### Opción C — Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t easySales .
docker run -p 3000:3000 --env-file .env easySales
```

---

## Seguridad

- Las credenciales de Supabase **nunca** llegan al navegador directamente.
- El servidor las entrega solo si la contraseña es correcta.
- Las sesiones duran 8 horas y se guardan en memoria (reiniciar el servidor las invalida).
- La comparación de contraseña es resistente a timing attacks.
- Agregar HTTPS en producción es **obligatorio** (Nginx + certbot o el propio servicio cloud).

## .gitignore recomendado

```
.env
node_modules/
```
