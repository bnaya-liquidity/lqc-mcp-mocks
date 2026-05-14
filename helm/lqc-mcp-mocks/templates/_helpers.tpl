{{/* helm/lqc-mcp-mocks/templates/_helpers.tpl */}}
{{- define "lqc-mcp-mocks.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}
