'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
} from '@xyflow/react';

import { workflowStore, WorkflowRecord } from '@/lib/storage/workflowStore';
import { FlowPilotExecutor } from '@/core/engine/executor';
import { ExecutionResult, WorkflowNode, WorkflowEdge } from '@/core/types/workflow';

import { CustomWorkflowNode, WorkflowNodeData } from '@/components/canvas/CustomWorkflowNode';
import { NodeLibrary, AvailableNodeItem } from '@/components/canvas/NodeLibrary';
import { NodeConfigPanel } from '@/components/canvas/NodeConfigPanel';
import { ExecutionDrawer } from '@/components/canvas/ExecutionDrawer';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

import {
  ArrowLeft,
  Save,
  Play,
  RotateCcw,
  RotateCw,
  Power,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Layers,
} from 'lucide-react';

export default function BuilderPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params?.id as string;

  const [workflow, setWorkflow] = useState<WorkflowRecord | null>(null);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [status, setStatus] = useState<'active' | 'draft' | 'paused'>('draft');

  // React Flow State
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Save & Run State
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('Saved');

  // Execution Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);

  // Register Custom Node Type
  const nodeTypes = useMemo(
    () => ({
      custom: CustomWorkflowNode,
    }),
    []
  );

  // Load Workflow on Mount
  useEffect(() => {
    if (!workflowId) return;
    const existing = workflowStore.getById(workflowId);
    if (existing) {
      setWorkflow(existing);
      setWorkflowName(existing.name);
      setStatus(existing.status);

      // Convert Phase 1 WorkflowNodes to React Flow Nodes
      const rfNodes: Node[] = existing.nodes.map((n) => ({
        id: n.id,
        type: 'custom',
        position: n.position || { x: 150, y: 150 },
        data: {
          title: n.name,
          category: n.category,
          nodeType: n.type,
          description: n.description,
          config: n.config,
        } as unknown as Record<string, unknown>,
      }));

      // Convert Phase 1 WorkflowEdges to React Flow Edges
      const rfEdges: Edge[] = existing.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        animated: true,
        style: { stroke: '#2563EB', strokeWidth: 2 },
      }));

      setNodes(rfNodes);
      setEdges(rfEdges);
      setIsDirty(false);
    }
  }, [workflowId]);

  // Handle Node Changes (Drag, select, etc.)
  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    setIsDirty(true);
  }, []);

  // Handle Edge Changes (Delete edge)
  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    setIsDirty(true);
  }, []);

  // Handle New Connections
  const onConnect: OnConnect = useCallback((connection) => {
    setEdges((eds) =>
      addEdge(
        {
          ...connection,
          animated: true,
          style: { stroke: '#2563EB', strokeWidth: 2 },
        },
        eds
      )
    );
    setIsDirty(true);
  }, []);

  // Handle Node Click Selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  // Handle Canvas Background Click (Deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Add Node from Library Tray
  const handleAddNode = (item: AvailableNodeItem) => {
    const newId = `node_${Math.random().toString(36).substring(2, 7)}`;
    const newNode: Node = {
      id: newId,
      type: 'custom',
      position: { x: 300 + Math.random() * 50, y: 180 + Math.random() * 50 },
      data: {
        title: item.name,
        category: item.category,
        nodeType: item.type,
        description: item.description,
        config: {},
      } as unknown as Record<string, unknown>,
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(newId);
    setIsDirty(true);
  };

  // Update Node Config from Inspector Panel
  const handleUpdateNode = (
    nodeId: string,
    updatedData: Partial<WorkflowNodeData>
  ) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            data: {
              ...(n.data as unknown as WorkflowNodeData),
              ...updatedData,
            } as unknown as Record<string, unknown>,
          };
        }
        return n;
      })
    );
    setIsDirty(true);
  };

  // Delete Node
  const handleDeleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) =>
      eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
    );
    setSelectedNodeId(null);
    setIsDirty(true);
  };

  // Save Workflow Graph
  const handleSave = () => {
    if (!workflow) return;
    setIsSaving(true);

    const compiledNodes: WorkflowNode[] = nodes.map((n) => {
      const data = n.data as unknown as WorkflowNodeData;
      return {
        id: n.id,
        type: data.nodeType,
        category: data.category,
        name: data.title,
        description: data.description,
        config: data.config || {},
        position: n.position,
      };
    });

    const compiledEdges: WorkflowEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: e.targetHandle || undefined,
    }));

    const updatedWorkflow: WorkflowRecord = {
      ...workflow,
      name: workflowName.trim(),
      status,
      nodes: compiledNodes,
      edges: compiledEdges,
      updatedAt: new Date().toISOString(),
    };

    workflowStore.save(updatedWorkflow);
    setWorkflow(updatedWorkflow);
    setIsDirty(false);
    setIsSaving(false);
    setSaveMessage('Saved');
    setTimeout(() => setSaveMessage('Saved'), 2000);
  };

  // Test Run Workflow via Real Phase 1 Execution Engine
  const handleTestRun = async () => {
    setIsRunning(true);
    setIsDrawerOpen(true);

    // Save first so execution matches canvas state
    handleSave();

    try {
      const compiledNodes: WorkflowNode[] = nodes.map((n) => {
        const data = n.data as unknown as WorkflowNodeData;
        return {
          id: n.id,
          type: data.nodeType,
          category: data.category,
          name: data.title,
          description: data.description,
          config: data.config || {},
          position: n.position,
        };
      });

      const compiledEdges: WorkflowEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
      }));

      const testGraph = {
        id: workflowId,
        name: workflowName,
        nodes: compiledNodes,
        edges: compiledEdges,
      };

      // Execute via the real Phase 1 TypeScript DAG Engine!
      const executor = new FlowPilotExecutor();
      const testPayload = {
        budget: 15000,
        company: 'Wayne Enterprises',
        email: 'bruce@wayne.corp',
        leadName: 'Bruce Wayne',
      };

      const result = await executor.execute(testGraph, testPayload);
      setExecutionResult(result);
    } catch (err: unknown) {
      setExecutionResult({
        executionId: 'exec_failed',
        workflowId,
        status: 'failed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        traces: [],
        error: (err as Error).message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-50">
      {/* Top Navigation Bar */}
      <header className="flex h-14 w-full shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 z-30 select-none">
        {/* Left: Back & Title */}
        <div className="flex items-center gap-3">
          <Link
            href="/workflows"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors py-1 px-2 rounded-lg hover:bg-slate-100"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Workflows</span>
          </Link>

          <div className="h-4 w-px bg-slate-200" />

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={workflowName}
              onChange={(e) => {
                setWorkflowName(e.target.value);
                setIsDirty(true);
              }}
              className="text-sm font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-slate-50 px-1 py-0.5 rounded transition-all outline-none"
            />
            <Badge variant={status} size="sm">
              {status.toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* Center: Save State & Topology Metrics */}
        <div className="hidden md:flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1 font-medium text-slate-600">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            {nodes.length} Nodes, {edges.length} Edges
          </span>
          <span>•</span>
          <span className="font-mono text-[11px]">
            {isDirty ? (
              <span className="text-amber-600 font-medium">Unsaved changes</span>
            ) : (
              <span className="text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Saved
              </span>
            )}
          </span>
        </div>

        {/* Right Actions: Undo/Redo, Test Run, Save, Status */}
        <div className="flex items-center gap-2">
          {/* Status Toggle */}
          <button
            onClick={() => {
              const next = status === 'active' ? 'draft' : 'active';
              setStatus(next);
              setIsDirty(true);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              status === 'active'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{status === 'active' ? 'Active' : 'Draft'}</span>
          </button>

          {/* Test Run Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestRun}
            isLoading={isRunning}
            icon={<Play className="w-3.5 h-3.5 text-emerald-600" />}
          >
            Test Run
          </Button>

          {/* Save Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={isSaving}
            icon={<Save className="w-3.5 h-3.5" />}
          >
            Save
          </Button>
        </div>
      </header>

      {/* 3-Panel Main Workspace */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left Panel: Node Library */}
        <NodeLibrary onAddNode={handleAddNode} />

        {/* Center: React Flow Canvas */}
        <div className="relative flex-1 h-full bg-slate-50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            proOptions={{ hideAttribution: true }}
            className="bg-[#F8FAFC]"
          >
            <Background gap={16} size={1} color="#E2E8F0" />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              position="bottom-right"
              nodeStrokeColor="#2563EB"
              nodeColor="#EFF6FF"
              maskColor="rgb(241, 245, 249, 0.7)"
              className="!border !border-slate-200 !rounded-lg !overflow-hidden !shadow-sm !w-32 !h-24"
            />
          </ReactFlow>

          {/* Empty State Overlay if 0 nodes */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-6 shadow-sm max-w-sm pointer-events-auto">
                <Sparkles className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-slate-800">
                  Canvas is empty
                </h3>
                <p className="text-xs text-slate-500 mt-1 mb-4">
                  Select a trigger or action from the Node Library on the left to start building your automated flow.
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    handleAddNode({
                      type: 'trigger.webhook',
                      category: 'trigger',
                      name: 'Webhook Trigger',
                      description: 'Listen for inbound events',
                      icon: Play,
                    })
                  }
                >
                  Add Webhook Trigger
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Contextual Node Config Inspector */}
        <NodeConfigPanel
          selectedNode={selectedNode}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onClose={() => setSelectedNodeId(null)}
        />

        {/* Bottom Slide-Up Console: Live Execution Drawer */}
        <ExecutionDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          result={executionResult}
          isRunning={isRunning}
        />
      </div>
    </div>
  );
}

