# ChuletonBet compartido — versión para Render

Esta es una modificación de tu web original. **El aspecto y las secciones se conservan**, pero los datos compartidos dejan de guardarse en `localStorage` de cada móvil y pasan a una base de datos PostgreSQL.

Incluye:

- `public/index.html`: la web corregida.
- `server.js`: servidor Node.js que sirve la página y sincroniza los cambios con PostgreSQL.
- `package.json`: dependencia `pg` y comando de arranque.
- `render.yaml`: configuración para crear un Web Service y PostgreSQL automáticamente mediante un Blueprint de Render.
- `.env.example`: ejemplo de variables de entorno (no es necesario subir una contraseña a GitHub).

## Paso 1 — Guarda los datos que ya tenéis

**Antes de sustituir tu web actual**, abre la versión antigua en cada móvil donde haya apuestas, votos o saldo que queráis conservar. Ve al final de la página y pulsa **«⬇ Copia de seguridad»**. Guarda el archivo `copia-chuletonbet.json` de cada amigo.

Es importante hacerlo en **cada navegador que tenga datos diferentes**: antes, cada móvil era una base de datos independiente. Si alguno no tiene datos importantes, no hace falta exportarlos.

## Paso 2 — GitHub

Descomprime este proyecto y sube **los archivos y carpetas que contiene** a la **raíz de tu repositorio de GitHub**. No subas solamente `index.html`: Render necesita también `server.js`, `package.json` y `render.yaml`.

La estructura final del repositorio debe ser:

```
mi-repositorio/
├── public/
│   └── index.html
├── server.js
├── package.json
├── render.yaml
├── .gitignore
└── README.md
```

Si en la raíz tienes un antiguo `index.html`, no debe ser el archivo que sirva Render. El nuevo HTML está dentro de `public/`.

## Paso 3 — Render (método sencillo)

1. En https://dashboard.render.com/ elige **New > Blueprint**.
2. Vincula tu repositorio de GitHub, el que ahora contiene `render.yaml`.
3. Confirma la creación de los recursos que propone: un **Web Service** `chuletonbet-compartido` y un PostgreSQL `chuletonbet-db`.
4. Cuando Render muestre el Web Service como **Live**, abre su URL `https://...onrender.com`.
5. Comparte **esta URL nueva del Web Service**, no la del Static Site anterior, con los cinco amigos.

El Blueprint conecta automáticamente `DATABASE_URL`. El servidor crea su propia tabla de datos en la base de datos la primera vez que arranca.

### Alternativa: configurar Render manualmente

Si prefieres no usar el Blueprint:

1. **New > Postgres**: crea una base PostgreSQL.
2. **New > Web Service**: conecta tu repositorio, usa **Build Command** `npm install` y **Start Command** `npm start`.
3. En **Environment** añade `DATABASE_URL` con la *Internal Database URL* que muestra tu PostgreSQL si están en la misma región.
4. Espera a que el Web Service esté **Live**. El endpoint `/health` debe devolver `{"ok":true}`.

**No funciona como un `Static Site`** de HTML, porque los cambios necesitan un servidor que escriba en la base de datos.

## Paso 4 — Recuperar apuestas y caja antiguas

Abre la nueva URL. Abajo, selecciona **«⬆ Importar copia»** y elige uno de los JSON que guardaste. Repite con los demás JSON, si procede.

La importación **fusiona** datos en lugar de vaciar la base: mantiene la apuesta/voto más reciente de cada participante y la caja más reciente según la fecha de guardado. Para partidos manuales, combina los identificadores distintos. Haz una copia de seguridad compartida después de importar.

Si la nueva web tiene exactamente el **mismo dominio** que la antigua, quizás veas la opción **«Recuperar datos de este navegador»**; también puedes usarla para importar una copia local, pero los archivos JSON siguen siendo más fiables si cambió la URL.

## Paso 5 — Comprobar con dos móviles

1. En el móvil de Luis, abre la nueva URL y registra una cantidad en **Caja**.
2. En el móvil de Mario, abre la misma URL. El saldo debería verse inmediatamente si abre después del cambio; si ya tenía la web abierta, se actualiza automáticamente cada **12 segundos**, aproximadamente, siempre que la pestaña esté visible.
3. Seleccionad nombres distintos y guardad cuatro pronósticos cada uno: la sección **Participantes** debe mostrar las dos quinielas.
4. La votación, las cuotas manuales, los partidos manuales, los resultados y el historial se guardan en la misma base de datos.

## Protección con un código (opcional, recomendado)

En Render, abre el **Web Service > Environment**, crea una variable de entorno llamada `WRITE_PIN` e introduce un código secreto común **sin subirlo nunca a GitHub**. Haz redeploy si es necesario. Cada navegador te pedirá ese código al intentar guardar por primera vez.

Nota: es una **clave compartida de edición**, no un sistema de cuentas individuales. Un amigo que conozca el código puede seleccionar el nombre de otro. Cualquier visitante con la URL puede consultar los datos; no metas información privada en la web.

## Limitaciones importantes de Render gratuito

- Render **Free Web Service** puede entrar en reposo si no se usa; al abrirlo de nuevo, el primer acceso puede tardar.
- El disco del Web Service es **temporal**. Por eso la base de datos no se guarda en un archivo local del servidor.
- **Render Postgres gratuito caduca a los 30 días**. Para conservar la quiniela y la caja a largo plazo, cambia a una base PostgreSQL de pago o a una externa con una política de permanencia adecuada **antes de que caduque**. Exporta copias con regularidad.
- Este archivo usa el servicio externo MoviOdds para resultados y cuotas. Si esa fuente falla, seguirán estando disponibles las cuotas manuales, los partidos manuales y la base compartida, pero algunos partidos o cuotas automáticas podrían no mostrarse.

## Diagnóstico

- **El aviso dice que Render no devuelve JSON:** probablemente todavía abres el `Static Site` antiguo en vez del Web Service nuevo.
- **No arranca el servidor:** revisa `DATABASE_URL` y los **Logs** de Render.
- **«Código de edición incorrecto»:** revisa el `WRITE_PIN` en Render.
- **Una apuesta guardada no aparece en otro móvil:** verifica que ambos abren exactamente la misma URL del Web Service y comprueba si el segundo móvil lleva más de 12 segundos con la pestaña visible.
- **Quieres conservar todos los registros previos:** importa los JSON exportados de cada móvil. El HTML antiguo no compartía las entradas entre dispositivos.
