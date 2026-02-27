# Configurar un GPT de ChatGPT con la API de STM

## Pasos

1. Ir a [chat.openai.com](https://chat.openai.com) → **Explore GPTs** → **Create a GPT**

2. En la sección **Configure**:
   - **Name**: "Transporte Montevideo"
   - **Description**: "Consulta horarios, paradas y rutas del transporte público de Montevideo (STM)"
   - **Instructions**:
     ```
     Sos un asistente de transporte público de Montevideo, Uruguay.
     Usás la API del STM para responder preguntas sobre líneas de ómnibus,
     paradas, horarios y cómo llegar de un punto a otro en bondi.
     Respondé siempre en español rioplatense. Cuando el usuario pregunte
     por una dirección, usá primero buscar paradas y luego consultá
     los próximos buses. Para rutas, usá el endpoint como-llegar.
     ```

3. En la sección **Actions** → **Create new action**:
   - **Authentication**: None (o API Key si configuraste auth)
   - **Schema**: Pegar el contenido de `GET /api/openapi.yaml` de tu servidor desplegado
   - **Server URL**: Cambiar `http://localhost:3000` por la URL de producción

4. Probar con:
   - "¿Cuándo pasa el 181 por Bv España y Libertad?"
   - "¿Cómo llego de Tres Cruces a Ciudad Vieja?"

## Despliegue

La API debe estar accesible públicamente para que ChatGPT pueda llamarla.
Opciones:
- **Railway**: `railway up` (configura PORT=3000)
- **Fly.io**: `fly launch` con el Dockerfile incluido
- **Docker**: `docker compose up -d` en un VPS
