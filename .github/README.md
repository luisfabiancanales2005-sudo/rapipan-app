# Rapipan Admin

Aplicación privada para registrar y analizar la operación diaria de Rapipan. El sitio se publica como exportación estática en GitHub Pages; las cuentas y los datos se protegen con Supabase Auth y Row Level Security.

## Desarrollo

Requiere Node.js 24 y pnpm 11. Copia `.env.example` a `.env.local` y configura la URL y la clave **pública** de Supabase. Nunca uses una clave `service_role` en `NEXT_PUBLIC_*`.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

El workflow de `.github/workflows/deploy-pages.yml` publica `out/` en Pages desde `main`. Requiere las variables de Actions `SUPABASE_URL` y `SUPABASE_ANON_KEY` y el origen de Pages configurado como GitHub Actions. La ruta base se calcula a partir del nombre del repositorio.

El Excel original, las notas de conciliación, los archivos de entorno locales y los artefactos generados quedan fuera del repositorio.
