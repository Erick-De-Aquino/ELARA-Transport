/*
  Proyecto Atlas / ELARA Transport
  Archivo: reports.mock.js
  Responsabilidad: datos simulados de la pantalla Reportes.
*/

"use strict";

window.ElaraReportsMock = {
  summary: [
    { label: "Servicios del mes", value: "128", tone: "neutral" },
    { label: "Ingresos estimados", value: "9.850 EUR", tone: "success" },
    { label: "Km registrados", value: "18.450 km", tone: "info" },
    { label: "Ticket promedio", value: "76,95 EUR", tone: "neutral" },
    { label: "Clientes activos", value: "42", tone: "success" },
  ],
  blocks: [
    {
      title: "Operacion",
      metrics: [
        "112 servicios completados",
        "6 cancelados",
        "3 no show",
        "7 servicios pendientes",
      ],
    },
    {
      title: "Ingresos",
      metrics: [
        "9.850 EUR estimados",
        "2.140 EUR efectivo",
        "3.980 EUR datafono",
        "1.420 EUR factura pendiente",
      ],
    },
    {
      title: "Clientes",
      metrics: [
        "42 clientes activos",
        "8 nuevos clientes",
        "16 clientes frecuentes",
        "2 clientes en observacion",
      ],
    },
    {
      title: "Colaboradores",
      metrics: [
        "14 choferes con servicios",
        "9 disponibles",
        "112 servicios completados",
        "4 incidencias registradas",
      ],
    },
    {
      title: "Vehiculos",
      metrics: [
        "18.450 km registrados",
        "7 vehiculos activos",
        "2 mantenimientos proximos",
        "2 vehiculos inoperativos",
      ],
    },
  ],
  charts: [
    {
      id: "vehicle-revenue",
      title: "Ingresos por vehiculo",
      description: "Comparativa de ingresos estimados por coche.",
      metric: "9.850 EUR estimados",
      unit: "EUR",
      chartType: "bar",
      items: [
        { label: "Mercedes-Benz Clase V", value: 4250 },
        { label: "Tesla Model Y", value: 3100 },
        { label: "BMW Serie 5", value: 2500 },
        { label: "Mercedes-Benz EQS", value: 2180 },
      ],
    },
    {
      id: "eur-km",
      title: "Productividad EUR/km",
      description: "Ingreso estimado generado por kilometro registrado.",
      metric: "1,23 EUR/km promedio",
      unit: "EUR/km",
      chartType: "bar",
      items: [
        { label: "Tesla Model Y", value: 1.47 },
        { label: "Mercedes-Benz Clase V", value: 1.33 },
        { label: "Mercedes-Benz EQS", value: 1.18 },
        { label: "BMW Serie 5", value: 0.89 },
      ],
    },
    {
      id: "services-driver",
      title: "Servicios por colaborador",
      description: "Carga operativa por chofer durante el periodo activo.",
      metric: "Total: 112 servicios completados - Promedio: 28 servicios por colaborador",
      unit: "servicios",
      chartType: "bar",
      items: [
        { label: "Marta Ruiz", value: 32 },
        { label: "Sergio Martin", value: 28 },
        { label: "Elena Cano", value: 24 },
        { label: "Carlos Medina", value: 18 },
      ],
    },
    {
      id: "service-types",
      title: "Tipos de servicio",
      description: "Distribucion de servicios por categoria operativa.",
      metric: "Aeropuerto lidera el mes",
      unit: "servicios",
      chartType: "bar",
      items: [
        { label: "Aeropuerto", value: 45 },
        { label: "Punto a punto", value: 38 },
        { label: "Larga distancia", value: 18 },
        { label: "Mascotas", value: 12 },
        { label: "Full Day", value: 8 },
      ],
    },
    {
      id: "incidents",
      title: "Incidencias operativas",
      description: "Problemas relevantes detectados en el periodo.",
      metric: "Total: 16 incidencias - Promedio: 2,3 incidencias por coche",
      unit: "casos",
      chartType: "bar",
      items: [
        { label: "Cancelados", value: 6 },
        { label: "Reprogramados", value: 5 },
        { label: "No show", value: 3 },
        { label: "Documentacion pendiente", value: 2 },
      ],
    },
  ],
};
