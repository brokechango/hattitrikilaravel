# Auditoría UI/UX · Hattitriki FC

## Punto de partida

La aplicación ya tenía una base sólida: contraste alto, navegación adaptativa, estados vacíos y de error, foco visible, enlace para saltar al contenido y una paleta reconocible. El problema no era funcional, sino de posicionamiento visual: la interfaz se leía como un dashboard genérico de tarjetas y no como un producto centrado en fútbol.

## Hallazgos

1. **La jerarquía deportiva era débil.** El último resultado tenía el mismo lenguaje de tarjeta que filtros, formularios y estadísticas. Marcador, estado del partido y equipos necesitaban una lectura más rápida.
2. **Demasiadas superficies competían entre sí.** Bordes, radios amplios y elevación uniforme daban el mismo peso a casi todos los bloques.
3. **La navegación era correcta pero poco editorial.** Faltaba el contexto persistente de competición que utilizan los productos de resultados deportivos.
4. **La tipografía no diferenciaba datos de contenido.** Títulos, etiquetas y números usaban una voz similar; los datos deportivos necesitaban cifras tabulares y una familia condensada en titulares.
5. **La pantalla de acceso no anticipaba el producto.** Era clara y accesible, pero parecía un formulario aislado. No comunicaba resultados, actas ni rankings antes de iniciar sesión.
6. **La densidad no estaba optimizada.** En escritorio había demasiado aire en algunas tarjetas y, al mismo tiempo, filtros y controles ocupaban más altura de la necesaria.
7. **La identidad dependía demasiado del dorado.** El acento aparecía en bordes, títulos, botones y marcadores. Al reservarlo para datos, selección y acción, gana fuerza.

## Dirección de rediseño

- Mantener azul marino, dorado, rojo y blanco roto como identidad.
- Usar una composición de “centro de resultados”: navegación compacta, barra de competición, marcador protagonista y rankings tabulares.
- Diferenciar superficies por tono y separación, reduciendo bordes decorativos.
- Aplicar tipografía condensada en títulos y etiquetas; cifras tabulares en marcadores y estadísticas.
- Hacer los estados interactivos más claros con subrayado activo, desplazamiento mínimo y foco consistente.
- Convertir el acceso en una portada de producto sin añadir rutas públicas ni exponer datos privados.

## Referencias aplicadas

- **SofaScore:** jerarquía de datos, navegación deportiva persistente y módulos densos.
- **Flashscore:** estado activo mediante una línea de acento, estructura de marcador y navegación compacta.
- **BeSoccer:** lectura vertical de jornadas/resultados y contraste entre cabeceras de competición y filas de partido.

No se copiaron componentes ni marcas. Se trasladaron patrones de información al lenguaje propio de Hattitriki.

## Alcance

El rediseño conserva rutas, autenticación, operaciones de Supabase, formularios y cálculos. Los cambios se concentran en estructura semántica de presentación, estilos y microcopy.
