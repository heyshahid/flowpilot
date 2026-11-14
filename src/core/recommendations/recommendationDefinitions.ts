import {
  RecommendationCategory,
  RecommendationSeverity,
  RecommendationAction,
} from './types';

export interface RuleDefinition {
  id: string;
  category: RecommendationCategory;
  name: string;
  description: string;
  defaultSeverity: RecommendationSeverity;
  initialThresholds: Record<string, number | string>;
  standardLimitations: string[];
  standardDataLimitations: string[];
  suggestedActions: RecommendationAction[];
}

export const RECOMMENDATION_RULES: Record<string, RuleDefinition> = {
  // Category 1: WORKFLOW_PERFORMANCE
  PERF_SLOW_WORKFLOW_P95: {
    id: 'PERF_SLOW_WORKFLOW_P95',
    category: 'WORKFLOW_PERFORMANCE',
    name: 'Elevated P95 Workflow Execution Latency',
    description:
      'Identifies workflows with high tail latency (P95 > 30,000ms and median > 10,000ms), which often signals unoptimized synchronous calls or slow remote dependencies.',
    defaultSeverity: 'MEDIUM',
    initialThresholds: {
      p95DurationMs: 30000,
      medianDurationMs: 10000,
      minSamples: 5,
    },
    standardLimitations: [
      'P95 latency is an empirical measurement from historical runs and does not isolate external network transit delays.',
      'Workflows processing large batch payloads naturally exhibit higher execution durations.',
    ],
    standardDataLimitations: [
      'Evaluated from a bounded sample of up to 500 recent executions.',
      'Execution traces without valid duration markers are excluded from calculation.',
    ],
    suggestedActions: [
      {
        id: 'act_perf_p95_1',
        title: 'Inspect Step-by-Step Duration Traces',
        description: 'Review node durations in Workflow Analytics to pinpoint the specific slow execution steps.',
        actionType: 'NAVIGATE',
        targetUrl: '/analytics/workflows/',
      },
      {
        id: 'act_perf_p95_2',
        title: 'Enable Asynchronous Execution',
        description: 'For non-blocking operations, configure webhook triggers or background worker queues to decouple execution.',
        actionType: 'CONFIGURATION_GUIDE',
      },
    ],
  },

  PERF_DURATION_DRIFT: {
    id: 'PERF_DURATION_DRIFT',
    category: 'WORKFLOW_PERFORMANCE',
    name: 'Workflow Latency Drift Over Baseline',
    description:
      'Detects workflows whose recent 5-run average execution duration has drifted > 50% higher than their historical 30-day baseline.',
    defaultSeverity: 'MEDIUM',
    initialThresholds: {
      driftPercentage: 50.0,
      recentRunCount: 5,
      baselineMinRuns: 10,
    },
    standardLimitations: [
      'Duration drift may be caused by seasonal payload size fluctuations rather than code degradation.',
    ],
    standardDataLimitations: [
      'Requires at least 10 baseline executions and 5 recent runs for comparison.',
    ],
    suggestedActions: [
      {
        id: 'act_drift_1',
        title: 'Review Recent Payload Variations',
        description: 'Compare input payload sizes and item counts between recent and historical executions.',
        actionType: 'INSPECTION',
      },
    ],
  },

  PERF_POTENTIAL_PARALLELIZATION: {
    id: 'PERF_POTENTIAL_PARALLELIZATION',
    category: 'WORKFLOW_PERFORMANCE',
    name: 'Sequential Execution of Independent Tasks',
    description:
      'Identifies sequences of 2 or more independent HTTP or AI steps that run linearly and could potentially run in parallel to reduce overall execution time.',
    defaultSeverity: 'LOW',
    initialThresholds: {
      minSequentialSteps: 2,
    },
    standardLimitations: [
      'Graph topology alone cannot prove execution independence. If steps rely on external side-effects, implicit database state, or provider rate limits, sequential execution must be preserved.',
      'FlowPilot does not automatically convert steps to parallel branches; dependencies and rate limits must be considered.',
      'Advisory only: developer inspection required to verify whether linear nodes share hidden temporal dependencies.',
    ],
    standardDataLimitations: [
      'Inferred from workflow node connectivity and absence of inter-step data dependencies.',
    ],
    suggestedActions: [
      {
        id: 'act_par_1',
        title: 'Consider Parallel Branching',
        description: 'Open the visual builder to branch independent steps into parallel execution paths if order is not strict.',
        actionType: 'NAVIGATE',
        targetUrl: '/builder/',
      },
    ],
  },

  // Category 2: NODE_OPTIMIZATION
  NODE_DISPROPORTIONATE_DURATION: {
    id: 'NODE_DISPROPORTIONATE_DURATION',
    category: 'NODE_OPTIMIZATION',
    name: 'Disproportionate Node Duration Bottleneck',
    description:
      'Flags individual nodes consuming >= 40% of the entire workflow mean duration, indicating an isolated bottleneck.',
    defaultSeverity: 'HIGH',
    initialThresholds: {
      durationRatioThreshold: 0.40,
      minSamples: 5,
    },
    standardLimitations: [
      'Nodes handling complex AI transformations or large file uploads inherently dominate workflow runtime.',
      'Parallel and loop iterations can inflate contribution ratios above 1.0.',
    ],
    standardDataLimitations: [
      'Derived from individual node execution traces in terminal executions.',
    ],
    suggestedActions: [
      {
        id: 'act_node_dur_1',
        title: 'Tune Node Configuration',
        description: 'Review timeout and batch size configurations on the identified bottleneck node.',
        actionType: 'NAVIGATE',
        targetUrl: '/builder/',
      },
    ],
  },

  NODE_EXCESSIVE_RETRIES: {
    id: 'NODE_EXCESSIVE_RETRIES',
    category: 'NODE_OPTIMIZATION',
    name: 'Excessive Node Retry Activity',
    description:
      'Highlights nodes triggering repeated retries (average retries >= 1.5 per run or > 30% retry rate), signaling flaky network destinations or intermittent exceptions.',
    defaultSeverity: 'HIGH',
    initialThresholds: {
      retryRateThreshold: 0.30,
      minSamples: 5,
    },
    standardLimitations: [
      'Automatic retries prevent hard workflow failures but increase overall execution latency.',
    ],
    standardDataLimitations: [
      'Measured from recorded step execution attempt counters.',
    ],
    suggestedActions: [
      {
        id: 'act_node_retry_1',
        title: 'Add Exponential Backoff',
        description: 'Configure progressive exponential backoff or investigate remote endpoint stability.',
        actionType: 'CONFIGURATION_GUIDE',
      },
    ],
  },

  NODE_FREQUENT_TIMEOUTS: {
    id: 'NODE_FREQUENT_TIMEOUTS',
    category: 'NODE_OPTIMIZATION',
    name: 'Frequent Node Execution Timeouts',
    description:
      'Identifies nodes that fail with timeout errors (ETIMEDOUT, 504 Gateway Timeout, or timeout exceptions) in > 15% of recorded attempts.',
    defaultSeverity: 'CRITICAL',
    initialThresholds: {
      timeoutRateThreshold: 0.15,
      minSamples: 5,
    },
    standardLimitations: [
      'Timeout classification relies on standard error strings and HTTP 504 responses.',
    ],
    standardDataLimitations: [
      'Evaluated from step execution error messages and trace status history.',
    ],
    suggestedActions: [
      {
        id: 'act_node_timeout_1',
        title: 'Adjust Node Request Timeout',
        description: 'Increase the HTTP node timeout threshold or verify downstream endpoint latency.',
        actionType: 'CONFIGURATION_GUIDE',
      },
    ],
  },

  // Category 3: RELIABILITY
  REL_LOW_SUCCESS_RATE: {
    id: 'REL_LOW_SUCCESS_RATE',
    category: 'RELIABILITY',
    name: 'Low Terminal Workflow Success Rate',
    description:
      'Flags workflows whose overall completion rate falls below 80% across at least 5 terminal runs.',
    defaultSeverity: 'CRITICAL',
    initialThresholds: {
      successRateThreshold: 80.0,
      minSamples: 5,
    },
    standardLimitations: [
      'Cancelled executions are excluded from terminal success calculations.',
    ],
    standardDataLimitations: [
      'Calculated as completed / (completed + failed) over a 30-day reporting window.',
    ],
    suggestedActions: [
      {
        id: 'act_rel_succ_1',
        title: 'Investigate Execution Errors',
        description: 'Inspect the Executions dashboard filtered by failed status to examine stack traces.',
        actionType: 'NAVIGATE',
        targetUrl: '/executions?status=FAILED',
      },
    ],
  },

  REL_REPEATED_STAGE_FAILURE: {
    id: 'REL_REPEATED_STAGE_FAILURE',
    category: 'RELIABILITY',
    name: 'Repeated Failures at Identical Execution Stage',
    description:
      'Alerts when 3 or more consecutive runs fail at the exact same workflow node, indicating a persistent failure rather than transient network glitch.',
    defaultSeverity: 'CRITICAL',
    initialThresholds: {
      consecutiveFailures: 3,
    },
    standardLimitations: [
      'Identifies the terminal failed step; earlier silent step degradations may not be captured.',
    ],
    standardDataLimitations: [
      'Derived from chronological execution trace ordering.',
    ],
    suggestedActions: [
      {
        id: 'act_stage_fail_1',
        title: 'Verify Input Data and Authentication',
        description: 'Check credential validity and required input parameters for the failing node.',
        actionType: 'NAVIGATE',
        targetUrl: '/credentials',
      },
    ],
  },

  // Category 4: INTEGRATION
  INT_WEBHOOK_REJECTION_SPIKE: {
    id: 'INT_WEBHOOK_REJECTION_SPIKE',
    category: 'INTEGRATION',
    name: 'High Inbound Webhook Rejection Rate',
    description:
      'Detects when >= 15% of incoming webhook deliveries are rejected due to invalid payloads, missing signatures, or inactive endpoints.',
    defaultSeverity: 'HIGH',
    initialThresholds: {
      rejectionRateThreshold: 15.0,
      minSamples: 10,
    },
    standardLimitations: [
      'Rejection rate includes unauthorized bot traffic and malformed third-party test pings.',
    ],
    standardDataLimitations: [
      'Evaluated from the rolling 500-record webhook deliveries buffer in WebhookStore.',
    ],
    suggestedActions: [
      {
        id: 'act_wh_rej_1',
        title: 'Audit Webhook Deliveries',
        description: 'Review webhook delivery logs in Analytics to verify request headers and verification secrets.',
        actionType: 'NAVIGATE',
        targetUrl: '/analytics/integrations',
      },
    ],
  },

  INT_RATE_LIMIT_BACKOFF: {
    id: 'INT_RATE_LIMIT_BACKOFF',
    category: 'INTEGRATION',
    name: 'Third-Party Integration Rate Limiting (HTTP 429)',
    description:
      'Surfaces repeated HTTP 429 (Too Many Requests) responses from external integration APIs, indicating quota saturation.',
    defaultSeverity: 'HIGH',
    initialThresholds: {
      min429Occurrences: 3,
    },
    standardLimitations: [
      'Rate limit thresholds are determined by third-party providers (e.g. Slack, Google Sheets) and cannot be altered within FlowPilot.',
    ],
    standardDataLimitations: [
      'Classified using IntegrationHealthService failure taxonomy.',
    ],
    suggestedActions: [
      {
        id: 'act_int_429_1',
        title: 'Add Pacing Delay or Spacing',
        description: 'Introduce small wait or delay intervals between high-frequency outbound requests.',
        actionType: 'CONFIGURATION_GUIDE',
      },
    ],
  },

  INT_AUTHENTICATION_EXPIRED: {
    id: 'INT_AUTHENTICATION_EXPIRED',
    category: 'INTEGRATION',
    name: 'Integration Authentication Failure (HTTP 401/403)',
    description:
      'Detects repeated unauthorized or forbidden errors on third-party service connections, indicating expired OAuth tokens or revoked API keys.',
    defaultSeverity: 'CRITICAL',
    initialThresholds: {
      minAuthFailures: 2,
    },
    standardLimitations: [
      'FlowPilot verifies credential format but cannot proactively re-authenticate third-party OAuth flows without user action.',
    ],
    standardDataLimitations: [
      'Derived from CredentialStore status and outbound HTTP response codes.',
    ],
    suggestedActions: [
      {
        id: 'act_int_auth_1',
        title: 'Reconnect / Refresh Credential in Vault',
        description: 'Navigate to Credentials Vault to re-enter API key or re-authorize OAuth connection.',
        actionType: 'NAVIGATE',
        targetUrl: '/credentials',
      },
    ],
  },

  // Category 5: AI_COST
  AI_HIGH_TOKEN_CONSUMPTION: {
    id: 'AI_HIGH_TOKEN_CONSUMPTION',
    category: 'AI_COST',
    name: 'High AI Token Volume per Execution',
    description:
      'Identifies workflows consuming > 50,000 tokens per execution run, creating elevated operational expenditure.',
    defaultSeverity: 'MEDIUM',
    initialThresholds: {
      tokensPerRunThreshold: 50000,
      minSamples: 3,
    },
    standardLimitations: [
      'Token consumption depends on document length and user input size.',
    ],
    standardDataLimitations: [
      'Extracted from token usage metadata recorded in AIUsageStore.',
    ],
    suggestedActions: [
      {
        id: 'act_ai_tok_1',
        title: 'Optimize Prompt Template',
        description: 'Truncate or summarize verbose system context and instruct models to return concise JSON responses.',
        actionType: 'CONFIGURATION_GUIDE',
      },
    ],
  },

  AI_MODEL_TIERING_OPPORTUNITY: {
    id: 'AI_MODEL_TIERING_OPPORTUNITY',
    category: 'AI_COST',
    name: 'Cost Reduction Opportunity: Model Tiering',
    description:
      'Identifies heavy general reasoning models (e.g. GPT-4, Claude 3.5 Sonnet) used for straightforward tasks (e.g. basic entity extraction or formatting) that faster, cheaper models can handle.',
    defaultSeverity: 'LOW',
    initialThresholds: {
      minRequests: 5,
    },
    standardLimitations: [
      'Model tiering suggestions are qualitative advisories; quality and accuracy must be verified by the user before changing models.',
    ],
    standardDataLimitations: [
      'Costs are advisory estimates based on published provider token rates.',
    ],
    suggestedActions: [
      {
        id: 'act_ai_tier_1',
        title: 'Evaluate Lightweight Model (Flash / Mini)',
        description: 'Test running prompt with a lightweight model in the AI Assistant or builder test pane.',
        actionType: 'NAVIGATE',
        targetUrl: '/ai-assistant',
      },
    ],
  },

  AI_UNPRICED_MODEL_USAGE: {
    id: 'AI_UNPRICED_MODEL_USAGE',
    category: 'AI_COST',
    name: 'Unpriced AI Model Invocations Detected',
    description:
      'Detects active AI usage of models missing from the versioned catalog, preventing accurate financial cost estimation.',
    defaultSeverity: 'LOW',
    initialThresholds: {
      minUnpricedRequests: 1,
    },
    standardLimitations: [
      'Unpriced requests display $0.00 estimated cost in reports but consume real provider quota.',
    ],
    standardDataLimitations: [
      'Identified when AIPricingManager returns isAvailable: false.',
    ],
    suggestedActions: [
      {
        id: 'act_ai_unpriced_1',
        title: 'Review Configured AI Models',
        description: 'Check model naming in AI nodes to match standard catalog identifiers.',
        actionType: 'NAVIGATE',
        targetUrl: '/analytics/ai-usage',
      },
    ],
  },

  // Category 6: SCHEDULING
  SCHED_MISSED_RUNS: {
    id: 'SCHED_MISSED_RUNS',
    category: 'SCHEDULING',
    name: 'Overdue / Missed Workflow Schedule Execution',
    description:
      'Alerts when active schedules are past their target nextRunAt by > 5 minutes without a corresponding execution record.',
    defaultSeverity: 'HIGH',
    initialThresholds: {
      overdueMinutesThreshold: 5,
    },
    standardLimitations: [
      'Missed runs in local dev environments occur if the Node.js server process is offline during the schedule window.',
    ],
    standardDataLimitations: [
      'Calculated from schedule nextRunAt vs current server wall-clock time.',
    ],
    suggestedActions: [
      {
        id: 'act_sched_miss_1',
        title: 'Check Scheduler Health',
        description: 'Verify background worker queue status in Monitoring and trigger manual run if needed.',
        actionType: 'NAVIGATE',
        targetUrl: '/schedules',
      },
    ],
  },

  SCHED_INTERVAL_CONGESTION: {
    id: 'SCHED_INTERVAL_CONGESTION',
    category: 'SCHEDULING',
    name: 'Scheduled Execution Congestion (Top of the Hour)',
    description:
      'Identifies multiple active workflows scheduled to execute at the exact same minute (e.g. 00 * * * *), which can cause queue contention.',
    defaultSeverity: 'MEDIUM',
    initialThresholds: {
      overlappingSchedulesThreshold: 3,
    },
    standardLimitations: [
      'Single-worker execution queue processes jobs sequentially.',
    ],
    standardDataLimitations: [
      'Analyzed from cron expressions across active workspace schedules.',
    ],
    suggestedActions: [
      {
        id: 'act_sched_cong_1',
        title: 'Stagger Schedule Cron Minutes',
        description: 'Offset schedule minutes (e.g. 5, 12, 23 past the hour) to distribute execution load evenly.',
        actionType: 'NAVIGATE',
        targetUrl: '/schedules',
      },
    ],
  },

  // Category 7: RESOURCE_USAGE
  RES_LIMIT_APPROACHING: {
    id: 'RES_LIMIT_APPROACHING',
    category: 'RESOURCE_USAGE',
    name: 'Resource Usage Approaching Quota Ceiling',
    description:
      'Warns when workspace consumption for workflows, executions, active schedules, or AI cost reaches 80% - 99% of admin-configured limits.',
    defaultSeverity: 'MEDIUM',
    initialThresholds: {
      warningPercentageThreshold: 80.0,
    },
    standardLimitations: [
      'Resource limits are administrative guidelines and do not silently delete or pause running workflows.',
    ],
    standardDataLimitations: [
      'Evaluated from WorkspaceLimitsStore and UsageService summaries.',
    ],
    suggestedActions: [
      {
        id: 'act_res_warn_1',
        title: 'Review Workspace Quotas',
        description: 'Inspect current consumption and adjust limits in Workspace Settings if business requirements have grown.',
        actionType: 'NAVIGATE',
        targetUrl: '/settings/usage',
      },
    ],
  },

  RES_LIMIT_EXCEEDED: {
    id: 'RES_LIMIT_EXCEEDED',
    category: 'RESOURCE_USAGE',
    name: 'Configured Resource Quota Ceiling Exceeded',
    description:
      'Alerts when a workspace metric exceeds 100% of the administrator-configured resource quota.',
    defaultSeverity: 'HIGH',
    initialThresholds: {
      criticalPercentageThreshold: 100.0,
    },
    standardLimitations: [
      'Non-destructive enforcement flags critical status to administrators without breaking running jobs.',
    ],
    standardDataLimitations: [
      'Evaluated from real persistent workspace tallies.',
    ],
    suggestedActions: [
      {
        id: 'act_res_crit_1',
        title: 'Adjust Quota Policies',
        description: 'Update quota policies in Usage & Quotas settings to accommodate increased volume.',
        actionType: 'NAVIGATE',
        targetUrl: '/settings/usage',
      },
    ],
  },

  // Category 8: WORKFLOW_ARCHITECTURE (Concrete Graph Topology Diagnostics)
  ARCH_UNHANDLED_ERROR_PATH: {
    id: 'ARCH_UNHANDLED_ERROR_PATH',
    category: 'WORKFLOW_ARCHITECTURE',
    name: 'Critical Node Lacks Error Handling Branch',
    description:
      'Identifies workflows containing critical HTTP, AI, or Database nodes with no error fallback connection or configured retry policy, creating risk of unhandled job crashes.',
    defaultSeverity: 'MEDIUM',
    initialThresholds: {
      minCriticalNodes: 1,
    },
    standardLimitations: [
      'Evaluated from workflow graph topology and node edge configurations in WorkflowStore.',
    ],
    standardDataLimitations: [
      'Static graph analysis; does not verify whether downstream nodes contain try/catch scripting logic.',
    ],
    suggestedActions: [
      {
        id: 'act_arch_err_1',
        title: 'Add Error Branch or Retries',
        description: 'Connect the onError port of the action node in the builder or enable step retries.',
        actionType: 'NAVIGATE',
        targetUrl: '/builder/',
      },
    ],
  },

  ARCH_HIGH_FANOUT_WITHOUT_BATCHING: {
    id: 'ARCH_HIGH_FANOUT_WITHOUT_BATCHING',
    category: 'WORKFLOW_ARCHITECTURE',
    name: 'High Graph Fan-Out Without Batching or Throttling',
    description:
      'Detects workflow triggers connecting directly to > 10 parallel outgoing branches, risking queue starvation and downstream rate limits.',
    defaultSeverity: 'LOW',
    initialThresholds: {
      maxFanoutEdges: 10,
    },
    standardLimitations: [
      'Certain fan-out designs are intentional; verify downstream rate capacity.',
    ],
    standardDataLimitations: [
      'Calculated from outgoing edge counts from trigger nodes in the workflow canvas graph.',
    ],
    suggestedActions: [
      {
        id: 'act_arch_fanout_1',
        title: 'Consider Batching or Queue Decoupling',
        description: 'Group parallel tasks or use queue-driven fan-out to prevent load spikes.',
        actionType: 'NAVIGATE',
        targetUrl: '/builder/',
      },
    ],
  },

  ARCH_UNBOUNDED_LOOP_RISK: {
    id: 'ARCH_UNBOUNDED_LOOP_RISK',
    category: 'WORKFLOW_ARCHITECTURE',
    name: 'Potentially Unbounded Loop Node Without Max Iterations',
    description:
      'Flags loop/while nodes configured without an explicit maximum iteration ceiling, risking runaway execution and timeout failure.',
    defaultSeverity: 'HIGH',
    initialThresholds: {
      maxIterationsDefault: 100,
    },
    standardLimitations: [
      'Workflow loop driver checks timeout limits, but setting explicit max iterations is recommended best practice.',
    ],
    standardDataLimitations: [
      'Inspects node parameters in the saved workflow definition.',
    ],
    suggestedActions: [
      {
        id: 'act_arch_loop_1',
        title: 'Configure Maximum Iterations Limit',
        description: 'Set a hard iteration boundary (e.g. 50 or 100) in the loop node settings.',
        actionType: 'NAVIGATE',
        targetUrl: '/builder/',
      },
    ],
  },
};

