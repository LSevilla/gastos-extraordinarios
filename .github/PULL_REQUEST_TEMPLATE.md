## Qué cambia

<!-- Descripción breve. Vincula el Sprint y, si corresponde, el RN-xxx / CU-xxx / TC-xxx involucrado. -->

## Sprint / referencia

- Sprint:
- Reglas de negocio relacionadas (RN-xxx):
- Casos de uso relacionados (CU-xxx):

## Checklist de arquitectura (Blueprint, Capítulo 3)

- [ ] No hay imports que crucen capas de forma prohibida (verificado por `npm run lint`)
- [ ] El dominio sigue sin depender de Infrastructure ni Presentation
- [ ] Si se agregó/modificó un object store de IndexedDB, incluye su migración versionada

## Checklist de pruebas

- [ ] Pruebas unitarias nuevas o actualizadas
- [ ] Casos de prueba funcionales (TC-xxx) correspondientes en verde
- [ ] Regresión: pruebas de Sprints anteriores relevantes siguen en verde

## Checklist de accesibilidad (si toca Presentation)

- [ ] Navegación por teclado verificada
- [ ] Foco visible y, si aplica, trampa de foco en modales
- [ ] Etiquetas de formulario asociadas correctamente

## Notas para quien revisa

<!-- Cualquier decisión no obvia, o algo que quieras que se mire con más atención. -->
