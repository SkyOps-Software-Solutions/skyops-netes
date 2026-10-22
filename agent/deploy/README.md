# SkyOps Kubernetes Agent RBAC & Operation Tiers

SkyOps Agent adheres to the Principle of Least Privilege (PoLP) through three deterministic RBAC permission tiers. Both Helm charts and standalone manifests produce identical authorization rules.

---

## Permission Tiers

| Tier | Workloads Managed | Verbs Granted | Use Case |
| :--- | :--- | :--- | :--- |
| **`observer`** | Pods, Nodes, Controllers, Namespaces, Events, Metrics, Logs | Read-only (`get`, `list`, `watch`), `authorization.k8s.io` SSAR `create` | Pure read-only monitoring, topology maps, incident root-cause analysis. Zero mutation allowed. |
| **`operator`** *(default)* | All `observer` resources + Pods, Deployments, StatefulSets, DaemonSets, CronJobs, Jobs | Mutation on workloads (`delete` on pods; `patch`, `update` on deployments & statefulsets; scale subresources; `create`, `patch`, `update`, `delete` on jobs/cronjobs) | Workload remediation, pod restarts, rollout management, scaling, job reruns. |
| **`admin`** | All `operator` resources + Nodes, Pod Eviction | Workload mutations + Node cordon/uncordon (`patch`/`update` on nodes) and safe drain (`create` on `pods/eviction`) | Full platform operations including worker node draining, cordoning, and scheduled maintenance. |

---

## 1. Helm Deployment

To set the permission tier via Helm:

### Observer (Read-Only)
```bash
helm upgrade --install skyops-agent ./deploy/helm \
  --namespace skyops-system --create-namespace \
  --set clusterId="<YOUR_CLUSTER_ID>" \
  --set agentToken="<YOUR_AGENT_TOKEN>" \
  --set serverUrl="https://skyops.example.com" \
  --set rbac.tier="observer"
```

### Operator (Default Workload Mutations)
```bash
helm upgrade --install skyops-agent ./deploy/helm \
  --namespace skyops-system --create-namespace \
  --set clusterId="<YOUR_CLUSTER_ID>" \
  --set agentToken="<YOUR_AGENT_TOKEN>" \
  --set serverUrl="https://skyops.example.com" \
  --set rbac.tier="operator"
```

### Platform Administrator (Node Operations & Drain)
```bash
helm upgrade --install skyops-agent ./deploy/helm \
  --namespace skyops-system --create-namespace \
  --set clusterId="<YOUR_CLUSTER_ID>" \
  --set agentToken="<YOUR_AGENT_TOKEN>" \
  --set serverUrl="https://skyops.example.com" \
  --set rbac.tier="admin"
```

---

## 2. Standalone Manifest Deployment

The standalone manifest `agent/deploy/skyops-agent.yaml` is preconfigured for the **Operator** tier.

- To run in **Observer** tier: Remove `delete` from the `pods` resource rule, and remove workload mutation blocks for `apps` and `batch`.
- To run in **Admin** tier: Uncomment the Node mutation and Pod Eviction blocks in `ClusterRole/skyops-agent-operator`.

---

## 3. Real Permission Discovery (SelfSubjectAccessReview)

At startup and every 5 minutes (or when credentials refresh), the agent dynamically evaluates its live Kubernetes permissions using Kubernetes `SelfSubjectAccessReviews` (SSAR).

Discovered capabilities include:
- `canDeletePods`
- `canRestartDeployments`
- `canScaleDeployments`
- `canScaleStatefulSets`
- `canMutateCronJobs`
- `canCreateJobs`
- `canDeleteJobs`
- `canCordonNodes`
- `canDrainNodes`

These live capabilities are reported in the agent's heartbeat payload (`operationalCapabilities` and `permissionTier`). The SkyOps central control plane and UI dynamically enable or disable action buttons based on the cluster agent's verified live capabilities, preventing permission-denied runtime errors.
