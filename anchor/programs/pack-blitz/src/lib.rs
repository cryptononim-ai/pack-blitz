// Pack Blitz — Solana Blitz v10 (Entertainment Finance).
// Anchor program: open a pack, VRF decides the card (1-6 roll), the
// callback stores the result on-chain. The player PDA is delegated to a
// MagicBlock Ephemeral Rollup, so pack opens are gasless and ~100ms.
//
// Adapted from MagicBlock's official roll-dice-DELEGATED example
// (https://github.com/magicblock-labs/magicblock-engine-examples/tree/main/roll-dice/anchor/programs/roll-dice-delegated)
// with ephemeral-rollups-sdk 0.16.2 (the exact version the upstream example
// pins; 0.18 dropped `create_request_scoped_randomness_ix`).
//
// CALLBACK BUG, STILL OPEN (25 Nov 2026): `callback_open_pack` burns its
// whole CU budget (270k on the VRF-invoked path, 200k on a direct call)
// and dies with ProgramFailedToComplete BEFORE the handler's first msg!.
// Ruled out: request variant (const 0.18 AND scoped 0.16.2 both fail
// identically), identity (the VRF program signs with the correct scoped
// PDA, bump 255), account structure (IDL is byte-identical in shape to
// the working demo program's), program size (370KB vs demo 327KB),
// build profile (release/optimized). The working demo callback costs
// ~10k CU. Current hypothesis: the `#[vrf_callback]` macro's generated
// address-constraint code (or Anchor 1.0.2's handling of it) loops/burns.
// DIAGNOSTIC: the macro is removed below; the identity is a plain Signer
// and is checked inside the handler after a first msg! so the burn's
// location becomes visible in the logs.
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{
    anchor::{commit, delegate, ephemeral, vrf},
    cpi::DelegateConfig,
    ephem::MagicIntentBundleBuilder,
    vrf::{
        self,
        instructions::{create_request_scoped_randomness_ix, RequestRandomnessParams},
        types::SerializableAccountMeta,
    },
};

// Program keypair generated 25 Nov 2026; secret lives only in the deploy
// secrets (never in the repo). `anchor keys sync` keeps this in sync.
declare_id!("53K2NJcMTxk36mVecCnSXzX29NmytimWh6a591oYuZSU");

pub const PLAYER_SEED: &[u8] = b"playerd2";

#[ephemeral]
#[program]
pub mod pack_blitz {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let player = &mut ctx.accounts.player;
        player.last_result = 0;
        player.rollnum = 0;
        msg!(
            "Pack Blitz player initialized: {:?}",
            ctx.accounts.player.key()
        );
        Ok(())
    }

    /// Open a pack: request VRF randomness. The callback reveals the card.
    pub fn open_pack(ctx: Context<OpenPackCtx>, client_seed: u8) -> Result<()> {
        msg!("Opening pack with client_seed={}", client_seed);
        let params = RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::CallbackOpenPack::DISCRIMINATOR.to_vec(),
            caller_seed: [client_seed; 32],
            accounts_metas: Some(vec![SerializableAccountMeta {
                pubkey: ctx.accounts.player.key(),
                is_signer: false,
                is_writable: true,
            }]),
            callback_args: Some(vec![client_seed]),
            ..Default::default()
        };
        let ix = create_request_scoped_randomness_ix(params);
        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        Ok(())
    }

    /// VRF callback: consume randomness, store the 1-6 roll, bump rollnum.
    /// The frontend maps 1-6 -> rarity (1-2 Common, 3-4 Rare, 5 Epic,
    /// 6 Legendary) and picks the card from on-chain rollnum.
    pub fn callback_open_pack(
        ctx: Context<CallbackOpenPackCtx>,
        randomness: [u8; 32],
        client_seed: u8,
    ) -> Result<()> {
        msg!("callback entered, client_seed={}", client_seed);
        // DIAGNOSTIC (see header): identity checked in-handler, not via the
        // #[vrf_callback] macro, until the CU-burn location is known.
        require_keys_eq!(
            ctx.accounts.vrf_program_identity.key(),
            vrf::consts::scoped_vrf_identity(&crate::ID),
            ErrorCode::ConstraintAddress
        );
        msg!("identity ok");
        let player = &mut ctx.accounts.player;
        let rnd_u8 = vrf::rnd::random_u8_with_range(&randomness, 1, 6);
        player.last_result = rnd_u8;
        player.rollnum = player.rollnum.saturating_add(1);
        msg!("Pack revealed roll (1-6): {}", rnd_u8);
        msg!("Roll number: {}", player.rollnum);
        Ok(())
    }

    /// Delegate the player account to an Ephemeral Rollup validator.
    pub fn delegate(ctx: Context<DelegateInput>) -> Result<()> {
        ctx.accounts.delegate_player(
            &ctx.accounts.user,
            &[PLAYER_SEED, &ctx.accounts.user.key().to_bytes().as_slice()],
            DelegateConfig {
                // Optionally set a specific validator from the first remaining account
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    /// Commit state back to base layer and undelegate.
    pub fn undelegate(ctx: Context<Undelegate>) -> Result<()> {
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.user.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init_if_needed, payer = payer, space = 8 + 2, seeds = [PLAYER_SEED, payer.key().to_bytes().as_slice()], bump)]
    pub player: Account<'info, Player>,
    pub system_program: Program<'info, System>,
}

#[vrf]
#[derive(Accounts)]
pub struct OpenPackCtx<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [PLAYER_SEED, payer.key().to_bytes().as_slice()], bump)]
    pub player: Account<'info, Player>,
    /// CHECK: validated by the ephemeral VRF program when it processes the request
    #[account(
        mut,
        constraint =
            oracle_queue.key() == vrf::consts::DEFAULT_QUEUE ||                // Devnet
            oracle_queue.key() == vrf::consts::DEFAULT_TEST_QUEUE ||           // Local
            oracle_queue.key() == vrf::consts::DEFAULT_EPHEMERAL_QUEUE ||      // ER Devnet
            oracle_queue.key() == vrf::consts::DEFAULT_EPHEMERAL_TEST_QUEUE    // ER Local
    )]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CallbackOpenPackCtx<'info> {
    /// CHECK: VRF program identity — validated in the handler (diagnostic
    /// for the callback CU-burn; see header). Normally this field is
    /// injected by `#[vrf_callback]` with an address constraint.
    pub vrf_program_identity: Signer<'info>,
    #[account(mut)]
    pub player: Account<'info, Player>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateInput<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK The pda to delegate
    #[account(mut, del, seeds = [PLAYER_SEED, user.key().to_bytes().as_slice()], bump)]
    pub player: UncheckedAccount<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct Undelegate<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [PLAYER_SEED, payer.key().to_bytes().as_slice()], bump)]
    pub user: Account<'info, Player>,
}

#[account]
pub struct Player {
    pub last_result: u8,
    pub rollnum: u8,
}
