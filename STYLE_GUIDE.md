# Guía de Estilo - SurtiTrack (Fase Tipografía)

## Visión General

Este documento establece las normas para mantener consistencia visual, tipográfica y de accesibilidad en SurtiTrack. El sistema está optimizado para rendimiento en Expo (React Native) con soporte automático para temas claro/oscuro.

---

## 1. Sistema de Tipografía Centralizada

### Componente `Typography`

Todos los textos **deben** usar el componente `<Typography>` (ubicado en `src/components/Typography.tsx`). Este componente reemplaza completamente `<Text>` nativo de React Native.

```tsx
import Typography from '../components/Typography';

// Uso básico
<Typography variant="body" color={theme.text}>
  Contenido de texto regular
</Typography>
```

### Variantes Disponibles

| Variante | Tamaño | Peso | Uso |
|----------|--------|------|-----|
| `h1` | 24px | Bold (700) | Títulos principales, encabezados |
| `h2` | 20px | Semibold (600) | Subtítulos, secciones |
| `h3` | 18px | Semibold (600) | Sub-subtítulos |
| `body` | 16px | Regular (400) | Texto de párrafos, contenido |
| `bodySmall` | 14px | Regular (400) | Etiquetas secundarias |
| `caption` | 12px | Regular (400) | Notas, metadatos |
| `label` | 14px | Medium (500) | Etiquetas de formularios |

### Props Disponibles

```typescript
interface TypographyProps {
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'caption' | 'label';
  color?: string;              // Color hexadecimal o tema
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';  // Override de peso
  tracking?: 'normal' | 'wide' | 'tight';               // Espaciado de letras
  align?: 'left' | 'center' | 'right';                  // Alineación horizontal
  numberOfLines?: number;                                // Truncar tras N líneas
  style?: ViewStyle;                                     // Estilos adicionales
  className?: string;                                    // Ignorado (compatibilidad)
}
```

### Ejemplos de Uso

```tsx
// Encabezado principal
<Typography variant="h1" weight="bold" color={theme.text} align="center">
  Resumen de solicitud
</Typography>

// Etiqueta de sección
<Typography variant="caption" color={theme.muted} tracking="wide">
  CATÁLOGO
</Typography>

// Texto de acción
<Typography 
  variant="body" 
  weight="semibold" 
  color={accentTextColor}
  numberOfLines={2}
>
  Agregar a la solicitud
</Typography>

// Con espaciado personalizado
<Typography variant="bodySmall" color={theme.muted} style={{ marginTop: 8 }}>
  Nota aclaratoria
</Typography>
```

---

## 2. Componente `CorporateButton`

Botones reutilizables que responden automáticamente a tema claro/oscuro.

```tsx
import CorporateButton from '../components/CorporateButton';

<CorporateButton
  label="Guardar cambios"
  onPress={() => savePreferences()}
  variant="primary"
  size="lg"
  theme={theme}
  accent={accent}
  accentTextColor={accentTextColor}
/>
```

### Props

```typescript
interface CorporateButtonProps {
  label?: string;                          // Texto del botón
  onPress: () => void;                     // Handler al presionar
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';              // Pequeño (36px), Medio (48px), Grande (56px)
  icon?: { name: string; position?: 'left' | 'right' };  // Icon opcional
  theme: { text, muted, panelBg, border, inputBorder };  // Objeto de tema
  accent: { color, border, soft };                         // Colores de acento
  accentTextColor: string;                 // Color del texto en modo activo
  disabled?: boolean;                      // Deshabilitado
  loading?: boolean;                       // Muestra estado cargando
  fullWidth?: boolean;                     // Ancho completo (default: true)
  hitSlop?: { top, bottom, left, right };  // Área de presión expandida
  testID?: string;                         // Para testing
  children?: ReactNode;                    // Contenido personalizado
}
```

### Variantes

- **primary**: Fondo azul corporativo, texto blanco. Acción principal.
- **secondary**: Fondo del panel, texto normal. Acciones secundarias.
- **outline**: Fondo transparente, borde definido. Acciones terciarias.
- **ghost**: Sin borde, fondo transparente. Para áreas densas.
- **danger**: Fondo rojo, texto blanco. Acciones peligrosas.

### Ejemplos

```tsx
// Botón primario
<CorporateButton
  label="Enviar solicitud"
  onPress={handleSend}
  variant="primary"
  size="lg"
  theme={theme}
  accent={accent}
  accentTextColor={accentTextColor}
/>

// Botón secundario con icono
<CorporateButton
  label="Descargar"
  variant="secondary"
  icon={{ name: 'download', position: 'left' }}
  onPress={handleDownload}
  size="md"
  theme={theme}
  accent={accent}
  accentTextColor={accentTextColor}
/>

// Botón pequeño de peligro
<CorporateButton
  label="Eliminar"
  variant="danger"
  size="sm"
  onPress={handleDelete}
  theme={theme}
  accent={accent}
  accentTextColor={accentTextColor}
/>
```

---

## 3. Sistema de Temas (Claro/Oscuro)

### Hook `useAppColorScheme`

Detecta automáticamente la preferencia del sistema operativo y permite override manual.

```tsx
import { useAppColorScheme } from '../hooks/useAppColorScheme';

const { theme, isLoading, setThemePreference, toggleTheme, systemTheme } = useAppColorScheme();
```

### Flujo de Detección

1. **Carga preferencia guardada** desde `AsyncStorage` (key: `app.themeMode.preference`)
2. **Si no existe** → usa `systemTheme` (preferencia del SO)
3. **Usuario puede override** → guarda en `AsyncStorage` y aplica inmediatamente
4. **No usa lock duro** → permite que preferencia de usuario sea independiente del SO

### Objeto de Tema

Cada pantalla define su objeto de tema dinámico:

```typescript
type ThemeObject = {
  pageBg: string;          // Fondo de página
  panelBg: string;         // Fondo de panel principal
  panelAltBg: string;      // Fondo de panel alternativo
  text: string;            // Color de texto principal
  muted: string;           // Color de texto secundario/atenuado
  border: string;          // Color de borde
  inputBg: string;         // Fondo de inputs
  inputBorder: string;     // Borde de inputs
  inputPlaceholder: string; // Placeholder text color
};
```

### Paleta de Colores por Modo

#### Modo Oscuro (Default)

```
Fondo página:    #081A33
Fondo panel:     #0E2748
Texto principal: #FFFFFF
Texto atenuado:  #A9C4EA
Borde:           #23456F
Acento:          #1D4ED8
```

#### Modo Claro

```
Fondo página:    #F2F7FD
Fondo panel:     #FFFFFF
Texto principal: #0D2447
Texto atenuado:  #4E6B94
Borde:           #D7E4F5
Acento:          #1D4ED8 (igual en ambos modos)
```

### Validación de Contraste

- Texto principal sobre fondo: **WCAG AA+** (≥7:1)
- Texto atenuado sobre fondo: **WCAG AA** (≥4.5:1)
- En modo claro especialmente validado para fatiga visual

---

## 4. Fuentes Profesionales

### Instalación

```bash
npm install @expo-google-fonts/inter @expo-google-fonts/roboto expo-font
```

### Fuentes Usadas

- **Inter** (400, 500, 600, 700): Tipografía principal, interfaz
- **Roboto**: Alternativa (si es necesario, no usado actualmente)

### Carga de Fuentes

```tsx
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

const [fontsLoaded] = useFonts({
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
});

if (!fontsLoaded) {
  return <Loading />;
}
```

**Nota**: Las fuentes se cargan automáticamente en `BolsasScreen.tsx` en la inicialización del app.

---

## 5. Patrones de Uso Comunes

### Sección con Título y Contenido

```tsx
<View className="rounded-2xl border px-5 py-5" style={{ backgroundColor: theme.panelBg }}>
  <Typography variant="h2" weight="bold" color={theme.text}>
    Título de sección
  </Typography>
  <Typography variant="body" color={theme.muted} style={{ marginTop: 8 }}>
    Descripción o contenido secundario
  </Typography>
</View>
```

### Formulario con Etiqueta

```tsx
<View>
  <Typography variant="label" color={theme.muted} style={{ marginBottom: 8 }}>
    Nombre del campo
  </Typography>
  <TextInput
    style={{ borderColor: theme.inputBorder, backgroundColor: theme.inputBg }}
    placeholderTextColor={theme.inputPlaceholder}
  />
</View>
```

### Card con Estatística

```tsx
<View className="flex-1 rounded-xl border px-3 py-2" 
  style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
  <Typography variant="caption" color={theme.muted} tracking="tight">
    Etiqueta
  </Typography>
  <Typography variant="h2" weight="bold" color={theme.text} style={{ marginTop: 4 }}>
    {value}
  </Typography>
</View>
```

### Botón con Estado Condicional

```tsx
<CorporateButton
  label={canSubmit ? "Enviar" : "Completa los campos"}
  variant={canSubmit ? "primary" : "secondary"}
  disabled={!canSubmit}
  onPress={handleSubmit}
  theme={theme}
  accent={accent}
  accentTextColor={accentTextColor}
/>
```

---

## 6. Checklist de Migración (Text → Typography)

Si encuentras un `<Text>` que necesita actualizar:

- [ ] Reemplazar `<Text` con `<Typography`
- [ ] Convertir `className="text-*"` a `variant` correspondiente
- [ ] Convertir `className="font-*"` a `weight` prop
- [ ] Convertir `className="tracking-*"` a `tracking` prop
- [ ] Convertir `style={{ color: ... }}` a `color` prop
- [ ] Reemplazar `</Text>` con `</Typography>`
- [ ] Validar con `npx tsc --noEmit`

---

## 7. Accesibilidad

### Requisitos WCAG AA+

- Todos los textos cumplen ratio de contraste ≥4.5:1
- Headers tienen suficiente contraste sobre fondos
- Modo claro optimizado para legibilidad sin fatiga

### Indicadores de Acciones

- Botones tienen mínimo 48x48px (hitSlop expandido)
- Textos de acción tienen weight≥semibold
- Colores nunca son únicos indicadores de estado

---

## 8. Performance

### Optimizaciones Aplicadas

- **Typography centralizado**: una única fuente de verdad para sizing
- **Fuentes preloaded**: Inter cargas al inicio, no en runtime
- **Tema memoizado**: evita recálculos innecesarios
- **NativeWind CSS**: solo estilos estáticos compilados

### Consejos

- Evitar `numberOfLines` en listas grandes (usa virtualization)
- Reutilizar objetos theme en componentes
- Mantener Typography siempre con `variant` explícito

---

## 9. Actualización de Diseño

Esta guía se creó en **Fase Tipografía** (Commit f84c001).

### Cambios Principales

1. ✅ Componente `Typography` centralizado
2. ✅ `useAppColorScheme` con detección automática
3. ✅ `CorporateButton` reutilizable
4. ✅ Fuentes profesionales Inter (400-700)
5. ✅ Validación WCAG AA+ en ambos modos

### Próximas Fases (Roadmap)

- **Fase 2**: Migración completa de todos los `<Text>` nativo
- **Fase 3**: Componentes semánticos (Card, Section, etc.)
- **Fase 4**: Sistema de animaciones consistentes
- **Fase 5**: Dark mode extremo (OLED optimization)

---

## 10. Referencias Rápidas

| Necesidad | Componente | Props |
|-----------|-----------|-------|
| Texto principal | `<Typography variant="body">` | color, weight |
| Encabezado | `<Typography variant="h1\|h2">` | weight, align |
| Etiqueta pequeña | `<Typography variant="caption">` | tracking, color |
| Botón acción | `<CorporateButton>` | variant, size, onPress |
| Tema automático | `useAppColorScheme()` | theme, setThemePreference |

---

**Mantenido por**: Equipo de Desarrollo SurtiTrack  
**Última actualización**: 19 de Abril, 2026 (Fase Tipografía)  
**Próxima revisión**: Después de Fase 2 (Migración completa)
