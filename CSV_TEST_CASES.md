# Casos de Prueba para Importación CSV

Guía de validación manual para la importación de archivos CSV en CalcPack. Estos casos cubren situaciones borde comunes en parseo de CSV.

## Formato Esperado

El archivo CSV debe tener las siguientes columnas:

```
categoria,titulo,modo,unidad_solicitud,peso_por_100,unidad_peso
```

- **categoria**: `bolsas`, `cajas`, u `otros`
- **titulo**: Nombre descriptivo del material
- **modo**: `bags`, `pieces`, u `other`
- **unidad_solicitud**: `kg`, `g`, `l`, o `pieces`
- **peso_por_100**: Número decimal (peso por 100 piezas si aplica)
- **unidad_peso**: `kg` o `g`

## Casos de Prueba

### ✅ Caso 1: CSV Básico Válido

**Archivo**: `test_valid_basic.csv`

```csv
categoria,titulo,modo,unidad_solicitud,peso_por_100,unidad_peso
bolsas,Bolsas Transparentes 30x40,bags,kg,2.5,kg
cajas,Caja Corrugada 20x15x10,pieces,pieces,0,kg
otros,Cinta Adhesiva 48mm,other,m,0,kg
```

**Resultado esperado**: Importación exitosa de 3 materiales. Mensaje: "Base importada: 3 materiales".

---

### ✅ Caso 2: CSV con Espacios en Encabezados

**Archivo**: `test_header_spaces.csv`

```csv
 categoria , titulo , modo , unidad_solicitud , peso_por_100 , unidad_peso 
bolsas,Bolsas Impresas,bags,kg,3.2,kg
cajas,Caja Estándar,pieces,pieces,0,kg
```

**Resultado esperado**: PapaParse trimea automáticamente. Importación exitosa de 2 materiales.

---

### ✅ Caso 3: CSV con Valores Numéricos con Coma Decimal

**Archivo**: `test_comma_decimals.csv`

```csv
categoria,titulo,modo,unidad_solicitud,peso_por_100,unidad_peso
bolsas,Bolsas Premium,bags,kg,"2,850",kg
cajas,Caja Especial,pieces,pieces,"1,5",kg
```

**Resultado esperado**: Importación exitosa. PapaParse maneja comillas. Sistema convierte comas a puntos.

---

### ✅ Caso 4: CSV con Comillas en Valores

**Archivo**: `test_quoted_values.csv`

```csv
categoria,titulo,modo,unidad_solicitud,peso_por_100,unidad_peso
bolsas,"Bolsas ""Extra Grandes""",bags,kg,5.0,kg
cajas,"Caja para ""Frágil""",pieces,pieces,0,kg
otros,"Papel de Embalaje 50cm",other,m,0,kg
```

**Resultado esperado**: PapaParse maneja escaping de comillas. Importación exitosa de 3 materiales.

---

### ✅ Caso 5: CSV con Líneas Vacías Intercaladas

**Archivo**: `test_empty_lines.csv`

```csv
categoria,titulo,modo,unidad_solicitud,peso_por_100,unidad_peso
bolsas,Bolsas Estándar,bags,kg,2.0,kg

cajas,Caja de Almacenamiento,pieces,pieces,0,kg

otros,Pegamento Industrial,other,ml,0,kg
```

**Resultado esperado**: PapaParse con `skipEmptyLines: 'greedy'` ignora líneas vacías. Importación exitosa de 3 materiales.

---

### ⚠️ Caso 6: CSV con Valores Faltantes

**Archivo**: `test_missing_values.csv`

```csv
categoria,titulo,modo,unidad_solicitud,peso_por_100,unidad_peso
bolsas,Bolsas Estándar,bags,kg,2.0,kg
cajas,Caja Especial,pieces,pieces,,
otros,Papel,,m,0,kg
```

**Resultado esperado**: Sistema debe ignorar filas incompletas y mostrar error parcial. Por ejemplo: "Importación con errores: Fila 3: columna 'modo' vacía (+1 más)".

---

### ⚠️ Caso 7: CSV con Tipos de Datos Inválidos

**Archivo**: `test_invalid_types.csv`

```csv
categoria,titulo,modo,unidad_solicitud,peso_por_100,unidad_peso
bolsas,Bolsas Estándar,bags,kg,abc,kg
cajas,Caja Especial,invalid_mode,pieces,0,kg
otros,Papel,other,invalid_unit,5.0,kg
```

**Resultado esperado**: Sistema rechaza valores inválidos. Mensaje: "Importación con errores: Fila 2: unidad 'invalid_mode' no válida".

---

### ⚠️ Caso 8: CSV Vacío o Solo Encabezados

**Archivo**: `test_headers_only.csv`

```csv
categoria,titulo,modo,unidad_solicitud,peso_por_100,unidad_peso
```

**Resultado esperado**: Sin datos. Mensaje: "No se encontraron registros válidos para importar."

---

### ⚠️ Caso 9: CSV con Encoding UTF-8 BOM

**Archivo**: `test_utf8_bom.csv`

```
﻿categoria,titulo,modo,unidad_solicitud,peso_por_100,unidad_peso
bolsas,Bolsas UTF-8,bags,kg,2.5,kg
```

**Resultado esperado**: PapaParse con `header: true` maneja BOM. Importación exitosa de 1 material.

---

### ⚠️ Caso 10: CSV con Caracteres Especiales

**Archivo**: `test_special_chars.csv`

```csv
categoria,titulo,modo,unidad_solicitud,peso_por_100,unidad_peso
bolsas,Bolsas Ecológicas™ ♻,bags,kg,2.0,kg
cajas,Caja Certificada ISO®,pieces,pieces,0,kg
otros,Papel Reciclado™,other,m,0,kg
```

**Resultado esperado**: Importación exitosa. Los caracteres especiales se preservan.

---

## Procedimiento de Prueba Manual

1. **Abrir CalcPack** en dispositivo o emulador
2. **Ir a Personalización de app** (engranaje)
3. **Sección "Importar base desde Excel/CSV"**
4. **Seleccionar archivo CSV**
5. **Observar mensaje de resultado** (éxito o error con detalles)
6. **Verificar datos importados** en la sección de materiales

## Checklist de Validación

- [ ] Caso 1: CSV básico importa sin errores
- [ ] Caso 2: Espacios en encabezados se ignoran
- [ ] Caso 3: Decimales con coma se convierten correctamente
- [ ] Caso 4: Comillas escapadas se manejan bien
- [ ] Caso 5: Líneas vacías se saltan
- [ ] Caso 6: Valores faltantes generan error específico
- [ ] Caso 7: Tipos inválidos se rechazan
- [ ] Caso 8: CSV vacío muestra mensaje apropié
- [ ] Caso 9: UTF-8 BOM se maneja sin corrupción
- [ ] Caso 10: Caracteres especiales se preservan

## Notas Técnicas

- **Parser**: PapaParse v5.5.3
- **Configuración**: `{ header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() }`
- **Validación**: Sistema valida contra esquema después de parseo
- **Manejo de errores**: Específico por fila con número de índice

