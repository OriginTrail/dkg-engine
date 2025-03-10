import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

// For debug purposes
// import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
// import { ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';

const sdk = new NodeSDK({
    serviceName: 'otnode',
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
    }),
    instrumentations: [getNodeAutoInstrumentations()],
});

console.log('Starting OpenTelemetry Instrumentation...');
sdk.start();
