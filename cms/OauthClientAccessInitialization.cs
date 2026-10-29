using EPiServer.Core;
using EPiServer.DataAbstraction;
using EPiServer.Framework;
using EPiServer.Framework.Initialization;
using EPiServer.Security;
using EPiServer.Web;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Optimizely.Cms.Service.V1.Authentication;

namespace Cms.Initialization;

// The REST API token carries a scope but no roles; config push needs Read and Create on the root
// to create the application's start content.
[ModuleDependency(typeof(InitializationModule))]
public class OauthClientAccessInitialization : IInitializableModule
{
    private const AccessLevel ClientAccess = AccessLevel.Read | AccessLevel.Create;

    public void Initialize(InitializationEngine context)
    {
        var clients = context.Services.GetRequiredService<IOptions<CmsServiceOauthOptions>>().Value.Clients;
        var repository = context.Services.GetRequiredService<IContentSecurityRepository>();
        var acl = (IContentSecurityDescriptor)repository.Get(ContentReference.RootPage).CreateWritableClone();

        var changed = false;
        foreach (var clientId in clients.Select(c => c.ClientId).Where(id => !string.IsNullOrEmpty(id)))
        {
            var current = acl.Entries
                .Where(e => e.EntityType == SecurityEntityType.User && e.Name == clientId)
                .Aggregate(AccessLevel.NoAccess, (access, e) => access | e.Access);
            if ((current & ClientAccess) == ClientAccess)
            {
                continue;
            }

            acl.AddEntry(new AccessControlEntry(clientId, current | ClientAccess, SecurityEntityType.User));
            changed = true;
        }

        if (changed)
        {
            repository.Save(ContentReference.RootPage, acl, SecuritySaveType.Replace);
        }
    }

    public void Uninitialize(InitializationEngine context)
    {
    }
}
