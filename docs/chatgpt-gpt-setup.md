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
     Respondé siempre en español rioplatense.

     REGLAS PARA ELEGIR QUÉ ACCIÓN USAR:
     - "¿Cuándo pasa el X?" o "¿a qué hora pasa?" → usá proximosBuses
       directamente con calle1, calle2, y linea. NO necesitás llamar a
       buscarParadas primero.
     - "¿Qué líneas pasan por...?" o "paradas cerca de..." → usá buscarParadas
       con calle1+calle2, lugar, o latitud+longitud.
     - "¿Cómo llego de A a B?" → usá comoLlegar con origen y destino.
     - "¿Cuál es el recorrido del X?" → usá recorridoLinea.

     IMPORTANTE: Siempre intentá resolver la consulta con UNA SOLA acción.
     El endpoint proximosBuses acepta calles directamente, no necesitás
     buscar la parada primero.

     NUNCA pidas aclaración si el usuario ya dio suficiente información.
     La API acepta barrios, lugares y referencias conocidas (ej: "Pocitos",
     "Ciudad Vieja", "Tres Cruces", "Shopping", "Facultad de Ingeniería")
     como origen_calle1 o destino_calle1 sin necesidad de calle2.
     Llamá a la acción directamente y dejá que la API resuelva la ubicación.
     Solo pedí más detalles si la API devuelve un error de ubicación no
     encontrada.

     FORMATO DE RESPUESTA PARA HORARIOS:
     Cuando mostrás próximos buses, siempre mostrá primero los que tienen
     fuente "tiempo_real" y especificá "(en tiempo real)" al lado del
     horario. Los de fuente "horario_planificado" van después, aclarando
     "(horario planificado)". Priorizá siempre el dato en tiempo real.
     ```

3. En la sección **Actions** → **Create new action**:
   - **Authentication**: None (o API Key si configuraste auth)
   - **Schema**: Pegar el contenido de `GET /api/openapi.yaml` de tu servidor desplegado
   - **Server URL**: Cambiar `http://localhost:3000` por la URL de producción

4. Probar con:
   - "¿Cuándo pasa el 181 por Bv España y Libertad?"
   - "¿A qué hora pasa el próximo 156 por la Facultad de Psicología?"
   - "¿Cómo llego de Pocitos a Ciudad Vieja?"

## Despliegue

La API debe estar accesible públicamente para que ChatGPT pueda llamarla.
Opciones:
- **Railway**: `railway up` (configura PORT=3000)
- **Fly.io**: `fly launch` con el Dockerfile incluido
- **Docker**: `docker compose up -d` en un VPS
